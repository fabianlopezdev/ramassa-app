import { describe, expect, test } from 'bun:test';
import { parseServiceCategoryRow } from './admin';
import {
  addEntityServiceComment,
  fetchOwnServiceContacts,
  getEntityServiceActions,
  saveEntityService,
} from './entity';

const category = parseServiceCategoryRow({
  id: '5eed0000-0000-4000-8009-000000000007',
  name: { ca: 'Lleure', es: 'Ocio', en: 'Leisure', ar: 'ترفيه', fa: 'تفریح' },
  slug: 'leisure-culture',
  icon: 'sparkles',
  color: 'primary',
  sort_order: 70,
  metadata_schema: {
    fields: [
      {
        key: 'activity_type',
        label: { ca: 'Tipus', es: 'Tipo', en: 'Type', ar: 'النوع', fa: 'نوع' },
        type: 'select',
        required: true,
        filterable: true,
        options: ['sports', 'cultural'],
      },
      {
        key: 'family_friendly',
        label: { ca: 'Famílies', es: 'Familias', en: 'Families', ar: 'عائلات', fa: 'خانواده' },
        type: 'boolean',
        required: true,
        filterable: true,
      },
    ],
  },
  created_at: '2026-08-10T12:00:00+00:00',
  updated_at: '2026-08-10T12:00:00+00:00',
});

test('an entity comment write has no internal-note input', async () => {
  const calls: unknown[] = [];
  const row = {
    id: '99000000-0000-4000-800d-000000000043',
    service_id: '5eed0000-0000-4000-800a-000000000001',
    author_role: 'entity',
    body: 'Dubte Àgora <script>alert(1)</script> Наталія',
    is_internal: false,
    created_at: '2026-08-10T18:00:00+00:00',
  };
  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return {
        insert(values: unknown) {
          calls.push(['insert', values]);
          return {
            select() {
              return {
                async single() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  await expect(
    addEntityServiceComment(client as never, row.service_id, row.body),
  ).resolves.toMatchObject({ body: row.body, isInternal: false });
  expect(calls).toContainEqual(['insert', { service_id: row.service_id, body: row.body }]);
});

const input = {
  categoryId: category.id,
  title: 'Servei Àgora <script>alert(1)</script>',
  description: 'Descripció útil',
  providerName: 'Creu Roja Osona',
  location: 'Vic',
  zone: 'Osona',
  costType: 'free' as const,
  costAmount: null,
  costDetails: null,
  contactName: 'Наталія Núria',
  contactPhone: '+34 900 000 000',
  contactEmail: 'natalia@example.test',
  contactRole: 'Tècnica',
  schedule: 'Matins',
  externalUrl: 'https://example.test/service',
  availability: 'available' as const,
  metadata: { activity_type: 'cultural', family_friendly: true },
  publishedAt: '2026-10-01T09:00:00.000Z',
  expiresAt: '2026-11-01T09:00:00.000Z',
};

describe('entity service action matrix', () => {
  test('exposes only the actions the entity may take in each submission state', () => {
    expect(getEntityServiceActions('draft')).toEqual(['edit', 'delete', 'submit']);
    expect(getEntityServiceActions('pending')).toEqual([]);
    expect(getEntityServiceActions('approved')).toEqual([]);
    expect(getEntityServiceActions('rejected')).toEqual(['edit', 'delete', 'resubmit']);
    expect(getEntityServiceActions('published')).toEqual(['edit']);
  });
});

test('a save sends validated service data without a client-controlled status', async () => {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push([name, args]);
      return { data: '5eed0000-0000-4000-800a-000000000099', error: null };
    },
  };

  await expect(saveEntityService(client as never, category, input, null)).resolves.toBe(
    '5eed0000-0000-4000-800a-000000000099',
  );
  expect(calls).toEqual([
    [
      'save_entity_service',
      {
        p_payload: expect.objectContaining({
          serviceId: null,
          title: input.title,
          contactName: input.contactName,
          publishedAt: input.publishedAt,
        }),
      },
    ],
  ]);
  expect(
    (calls[0] as [string, { p_payload: Record<string, unknown> }])[1].p_payload,
  ).not.toHaveProperty('status');
});

test('contact autocomplete parses the server-scoped own-contact result', async () => {
  const client = {
    async rpc() {
      return {
        data: [
          {
            contact_name: 'Наталія Núria',
            contact_phone: '+34 900 000 000',
            contact_email: 'natalia@example.test',
            contact_role: 'Tècnica',
            provider_name: 'Creu Roja Osona',
          },
        ],
        error: null,
      };
    },
  };

  await expect(fetchOwnServiceContacts(client as never)).resolves.toEqual([
    {
      name: 'Наталія Núria',
      phone: '+34 900 000 000',
      email: 'natalia@example.test',
      role: 'Tècnica',
      providerName: 'Creu Roja Osona',
    },
  ]);
});
