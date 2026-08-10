import { expect, test } from 'bun:test';
import { parseServiceCategoryRow } from './admin';
import {
  serializeServiceCategoryMetadataSchema,
  SERVICE_CATEGORY_DEFINITIONS,
} from './definitions';
import { addStaffServiceComment, fetchEntityServiceDecisionNotifications } from './entity';
import {
  approveEntityService,
  diffServiceSnapshots,
  fetchServiceReviewQueue,
  rejectEntityService,
  serviceReviewSearchSchema,
} from './review';

const pendingServiceId = '5eed0000-0000-4000-800a-000000000044';
const liveServiceId = '5eed0000-0000-4000-800a-000000000045';
const categoryId = '5eed0000-0000-4000-8009-000000000007';

function serviceCategory() {
  const definition = SERVICE_CATEGORY_DEFINITIONS[6];
  return parseServiceCategoryRow({
    id: categoryId,
    name: definition.name,
    slug: definition.slug,
    icon: definition.icon,
    color: definition.color,
    sort_order: definition.sortOrder,
    metadata_schema: serializeServiceCategoryMetadataSchema(definition),
    created_at: '2026-08-10T12:00:00.000Z',
    updated_at: '2026-08-10T12:00:00.000Z',
  });
}

test('the staff review queue applies its filters and keeps pending submissions first', async () => {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push([name, args]);
      return {
        data: [
          {
            item_kind: 'published_edit',
            item_id: '5eed0000-0000-4000-800b-000000000045',
            service_id: liveServiceId,
            category_id: categoryId,
            title: { ca: 'Servei editat' },
            provider_name: 'Entitat Àgora',
            contact_name: 'Наталія',
            status: 'published',
            changed_at: '2026-08-10T12:01:00.000Z',
            previous_service: { title: { ca: 'Abans' } },
            current_service: { title: { ca: 'Després' } },
            total_count: 2,
          },
          {
            item_kind: 'pending',
            item_id: pendingServiceId,
            service_id: pendingServiceId,
            category_id: categoryId,
            title: { ca: 'Servei pendent' },
            provider_name: 'Associació <script>alert(1)</script> Àgora',
            contact_name: 'Zoë',
            status: 'pending',
            changed_at: '2026-08-10T12:00:00.000Z',
            previous_service: null,
            current_service: null,
            total_count: 2,
          },
        ],
        error: null,
      };
    },
  };
  const search = serviceReviewSearchSchema.parse({
    kind: 'all',
    category: categoryId,
    query: 'Àgo',
    page: '2',
  });

  const page = await fetchServiceReviewQueue(client as never, search);

  expect(page.items.map((item) => item.kind)).toEqual(['pending', 'published_edit']);
  expect(page.total).toBe(2);
  expect(calls).toEqual([
    [
      'get_service_review_queue',
      {
        p_kind: 'all',
        p_category_id: categoryId,
        p_query: 'Àgo',
        p_page: 2,
      },
    ],
  ]);
});

test('the live-edit diff reports only entity-visible service changes from durable snapshots', () => {
  const previous = {
    id: liveServiceId,
    title: { ca: 'Orientació laboral', es: 'Orientación laboral' },
    contact_name: 'Zoë',
    availability: 'available',
    updated_at: '2026-08-10T12:00:00.000Z',
    reviewed_by: '5eed0000-0000-4000-8000-000000000002',
  };
  const current = {
    ...previous,
    title: { ca: 'Orientació laboral avançada', es: 'Orientación laboral' },
    contact_name: 'Наталія',
    updated_at: '2026-08-10T12:01:00.000Z',
    reviewed_by: null,
  };

  expect(diffServiceSnapshots(previous, current)).toEqual([
    {
      field: 'contact_name',
      previous: 'Zoë',
      current: 'Наталія',
    },
    {
      field: 'title',
      previous: { ca: 'Orientació laboral', es: 'Orientación laboral' },
      current: { ca: 'Orientació laboral avançada', es: 'Orientación laboral' },
    },
  ]);
});

test('approval sends the staff-edited multilingual publication and optional public comment atomically', async () => {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push([name, args]);
      return { data: pendingServiceId, error: null };
    },
  };
  const title = {
    ca: 'Servei <script>alert(1)</script> Àgora',
    es: 'Servicio Àgora',
    en: 'Àgora service',
    ar: 'خدمة أغورا',
    fa: 'خدمات آگورا',
  };

  await approveEntityService(
    client as never,
    serviceCategory(),
    pendingServiceId,
    {
      categoryId,
      title,
      description: null,
      providerName: 'Edició final de l’equip',
      location: 'Vic',
      zone: 'Osona',
      costType: 'free',
      costAmount: null,
      costDetails: null,
      contactName: 'Наталія',
      contactPhone: null,
      contactEmail: null,
      contactRole: null,
      schedule: null,
      externalUrl: null,
      availability: 'available',
      metadata: { activity_type: 'sports', family_friendly: true },
      status: 'published',
      publishedAt: '2026-08-10T12:05:00.000Z',
      expiresAt: null,
      images: [],
    },
    'Aprovat amb una revisió humana.',
  );

  expect(calls).toEqual([
    [
      'review_entity_service',
      {
        p_service_id: pendingServiceId,
        p_decision: 'approve',
        p_payload: expect.objectContaining({
          serviceId: pendingServiceId,
          title,
          providerName: 'Edició final de l’equip',
          status: 'published',
        }),
        p_comment: 'Aprovat amb una revisió humana.',
      },
    ],
  ]);
});

test('rejection refuses a blank human comment before calling the database', async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: pendingServiceId, error: null };
    },
  };

  await expect(rejectEntityService(client as never, pendingServiceId, '   ')).rejects.toThrow();
  expect(calls).toBe(0);

  await rejectEntityService(
    client as never,
    pendingServiceId,
    'Cal confirmar el telèfon de contacte amb l’entitat.',
  );
  expect(calls).toBe(1);
});

test('an internal staff note is inserted through the shared thread contract with secrecy explicit', async () => {
  const calls: unknown[] = [];
  const row = {
    id: '5eed0000-0000-4000-800c-000000000044',
    service_id: pendingServiceId,
    author_role: 'staff',
    body: 'Nota interna: trucar a la coordinadora Zoë.',
    is_internal: true,
    created_at: '2026-08-10T12:10:00.000Z',
  };
  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return {
        insert(values: unknown) {
          calls.push(['insert', values]);
          return {
            select(columns: string) {
              calls.push(['select', columns]);
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
    addStaffServiceComment(
      client as never,
      pendingServiceId,
      'Nota interna: trucar a la coordinadora Zoë.',
      'internal',
    ),
  ).resolves.toMatchObject({ isInternal: true, body: row.body });
  expect(calls).toContainEqual([
    'insert',
    {
      service_id: pendingServiceId,
      body: row.body,
      is_internal: true,
    },
  ]);
});

test('entity decision notifications expose the public human comment and service title', async () => {
  const calls: unknown[] = [];
  const query = {
    in(column: string, values: readonly string[]) {
      calls.push(['in', column, values]);
      return this;
    },
    order(column: string, options: unknown) {
      calls.push(['order', column, options]);
      return this;
    },
    then(resolve: (value: unknown) => void) {
      resolve({
        data: [
          {
            id: '5eed0000-0000-4000-800b-000000000099',
            service_id: pendingServiceId,
            kind: 'rejected',
            created_at: '2026-08-10T12:15:00.000Z',
            decision_comment: { body: 'Cal confirmar el telèfon de contacte.' },
            service: { title: { ca: 'Servei pendent' } },
          },
        ],
        error: null,
      });
    },
  };
  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return {
        select(columns: string) {
          calls.push(['select', columns]);
          return query;
        },
      };
    },
  };

  await expect(fetchEntityServiceDecisionNotifications(client as never)).resolves.toEqual([
    {
      id: '5eed0000-0000-4000-800b-000000000099',
      serviceId: pendingServiceId,
      kind: 'rejected',
      serviceTitle: { ca: 'Servei pendent' },
      comment: 'Cal confirmar el telèfon de contacte.',
      createdAt: '2026-08-10T12:15:00.000Z',
    },
  ]);
  expect(calls).toContainEqual(['in', 'kind', ['approved', 'rejected']]);
});
