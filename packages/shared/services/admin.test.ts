import { describe, expect, test } from 'bun:test';
import {
  applyAdminServiceQuery,
  createAdminServiceInputSchema,
  getServiceLifecycle,
  parseServiceCategoryRow,
  saveAdminService,
  serviceSearchSchema,
} from './admin';
import {
  serializeServiceCategoryMetadataSchema,
  SERVICE_CATEGORY_DEFINITIONS,
} from './definitions';

const completeText = {
  ca: 'Servei de prova',
  es: 'Servicio de prueba',
  en: 'Test service',
  ar: 'خدمة تجريبية',
  fa: 'خدمات آزمایشی',
};

describe('admin service category boundary', () => {
  test.each(SERVICE_CATEGORY_DEFINITIONS.map((definition) => [definition] as const))(
    '$slug parses the database JSON into the same form and validation contract',
    (definition) => {
      const category = parseServiceCategoryRow({
        id: `5eed0000-0000-4000-8009-00000000000${definition.sortOrder / 10}`,
        name: definition.name,
        slug: definition.slug,
        icon: definition.icon,
        color: definition.color,
        sort_order: definition.sortOrder,
        metadata_schema: serializeServiceCategoryMetadataSchema(definition),
        created_at: '2026-08-10T12:00:00+00:00',
        updated_at: '2026-08-10T12:00:00+00:00',
      });

      expect(category.definition.fields).toEqual(definition.fields);
      expect(category.contract.formFields).toEqual(definition.fields);
    },
  );

  test('the selected database category validates metadata and complete publish translations', () => {
    const category = parseServiceCategoryRow({
      id: '5eed0000-0000-4000-8009-000000000007',
      name: SERVICE_CATEGORY_DEFINITIONS[6].name,
      slug: SERVICE_CATEGORY_DEFINITIONS[6].slug,
      icon: SERVICE_CATEGORY_DEFINITIONS[6].icon,
      color: SERVICE_CATEGORY_DEFINITIONS[6].color,
      sort_order: SERVICE_CATEGORY_DEFINITIONS[6].sortOrder,
      metadata_schema: serializeServiceCategoryMetadataSchema(SERVICE_CATEGORY_DEFINITIONS[6]),
      created_at: '2026-08-10T12:00:00.000Z',
      updated_at: '2026-08-10T12:00:00.000Z',
    });
    const schema = createAdminServiceInputSchema(category);
    const valid = {
      categoryId: category.id,
      title: completeText,
      description: completeText,
      providerName: 'Associació <script>alert(1)</script> Àgora',
      location: 'Vic',
      zone: 'Osona',
      costType: 'free',
      costAmount: null,
      costDetails: null,
      contactName: 'Наталія',
      contactPhone: null,
      contactEmail: 'serveis@example.test',
      contactRole: null,
      schedule: null,
      externalUrl: 'https://example.test/servei',
      availability: 'available',
      metadata: { activity_type: 'sports', family_friendly: true },
      status: 'published',
      publishedAt: '2026-08-12T10:00:00.000Z',
      expiresAt: null,
      images: [{ url: 'org/services/image.webp', altText: completeText }],
    } as const;

    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, metadata: { activity_type: 'invalid' } }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...valid, title: { ca: 'Només català' } }).success).toBe(false);
    expect(
      schema.safeParse({ ...valid, images: [{ ...valid.images[0], altText: { ca: 'Foto' } }] })
        .success,
    ).toBe(false);
  });
});

describe('admin services list contract', () => {
  test('category and scheduled filters produce the same database predicates as the lifecycle label', () => {
    const search = serviceSearchSchema.parse({
      category: '5eed0000-0000-4000-8009-000000000007',
      status: 'scheduled',
      page: '2',
    });
    const calls: Array<readonly [string, ...unknown[]]> = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value]);
        return this;
      },
      gt(column: string, value: unknown) {
        calls.push(['gt', column, value]);
        return this;
      },
      lte(column: string, value: unknown) {
        calls.push(['lte', column, value]);
        return this;
      },
      or(filters: string) {
        calls.push(['or', filters]);
        return this;
      },
      order(column: string, options: unknown) {
        calls.push(['order', column, options]);
        return this;
      },
      range(from: number, to: number) {
        calls.push(['range', from, to]);
        return this;
      },
    };
    const now = new Date('2026-08-10T12:00:00.000Z');

    expect(applyAdminServiceQuery(query, search, now)).toBe(query);
    expect(calls).toEqual([
      ['eq', 'category_id', search.category],
      ['eq', 'status', 'published'],
      ['gt', 'published_at', now.toISOString()],
      ['order', 'updated_at', { ascending: false }],
      ['order', 'id', { ascending: true }],
      ['range', 25, 49],
    ]);
    expect(
      getServiceLifecycle(
        {
          status: 'published',
          publishedAt: '2026-08-11T12:00:00.000Z',
          expiresAt: null,
        },
        now,
      ),
    ).toBe('scheduled');
  });
});

test('the service save boundary validates first and sends one atomic RPC payload', async () => {
  const definition = SERVICE_CATEGORY_DEFINITIONS[6];
  const category = parseServiceCategoryRow({
    id: '5eed0000-0000-4000-8009-000000000007',
    name: definition.name,
    slug: definition.slug,
    icon: definition.icon,
    color: definition.color,
    sort_order: definition.sortOrder,
    metadata_schema: serializeServiceCategoryMetadataSchema(definition),
    created_at: '2026-08-10T12:00:00.000Z',
    updated_at: '2026-08-10T12:00:00.000Z',
  });
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push([name, args]);
      return { data: '5eed0000-0000-4000-800a-000000000099', error: null };
    },
  };

  const savedId = await saveAdminService(
    client as never,
    category,
    {
      categoryId: category.id,
      title: completeText,
      description: null,
      providerName: 'Associació <script>alert(1)</script> Àgora',
      location: 'Vic',
      zone: 'Osona',
      costType: 'free',
      costAmount: null,
      costDetails: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      contactRole: null,
      schedule: null,
      externalUrl: null,
      availability: 'available',
      metadata: { activity_type: 'sports', family_friendly: true },
      status: 'published',
      publishedAt: '2026-08-12T10:00:00.000Z',
      expiresAt: null,
      images: [],
    },
    null,
  );

  expect(savedId).toBe('5eed0000-0000-4000-800a-000000000099');
  expect(calls).toEqual([
    [
      'save_admin_service',
      {
        p_payload: expect.objectContaining({
          serviceId: null,
          providerName: 'Associació <script>alert(1)</script> Àgora',
          metadata: { activity_type: 'sports', family_friendly: true },
        }),
      },
    ],
  ]);
});
