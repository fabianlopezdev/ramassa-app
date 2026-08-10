import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import {
  createAdminServiceInputSchema,
  createAdminServiceRpcPayload,
  type AdminServiceCategory,
  type AdminServiceInput,
} from './admin';

export const SERVICE_REVIEW_PAGE_SIZE = 25;
export const SERVICE_REVIEW_KINDS = ['all', 'pending', 'published_edit'] as const;

export const serviceReviewSearchSchema = z.object({
  kind: z.enum(SERVICE_REVIEW_KINDS).catch('all').default('all'),
  category: z
    .union([z.literal('all'), z.uuid()])
    .catch('all')
    .default('all'),
  query: z.string().trim().max(200).catch('').default(''),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type ServiceReviewSearch = z.infer<typeof serviceReviewSearchSchema>;

const localizedTitleSchema = z.object({
  ca: z.string().trim().min(1),
  es: z.string().trim().min(1).optional(),
  en: z.string().trim().min(1).optional(),
  ar: z.string().trim().min(1).optional(),
  fa: z.string().trim().min(1).optional(),
});

const serviceReviewQueueRowSchema = z.object({
  item_kind: z.enum(['pending', 'published_edit']),
  item_id: z.uuid(),
  service_id: z.uuid(),
  category_id: z.uuid(),
  title: localizedTitleSchema,
  provider_name: z.string().nullable(),
  contact_name: z.string().nullable(),
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'published']),
  changed_at: z.string(),
  previous_service: z.record(z.string(), z.unknown()).nullable(),
  current_service: z.record(z.string(), z.unknown()).nullable(),
  total_count: z.coerce.number().int().nonnegative(),
});

export interface ServiceReviewQueueItem {
  readonly kind: 'pending' | 'published_edit';
  readonly id: string;
  readonly serviceId: string;
  readonly categoryId: string;
  readonly title: z.infer<typeof localizedTitleSchema>;
  readonly providerName: string | null;
  readonly contactName: string | null;
  readonly status: 'draft' | 'pending' | 'approved' | 'rejected' | 'published';
  readonly changedAt: string;
  readonly previousService: Readonly<Record<string, unknown>> | null;
  readonly currentService: Readonly<Record<string, unknown>> | null;
}

export interface ServiceReviewQueuePage {
  readonly items: readonly ServiceReviewQueueItem[];
  readonly total: number;
}

const REVIEWED_SERVICE_FIELDS = [
  'availability',
  'category_id',
  'contact_email',
  'contact_name',
  'contact_phone',
  'contact_role',
  'cost_amount',
  'cost_details',
  'cost_type',
  'description',
  'expires_at',
  'external_url',
  'location',
  'metadata',
  'provider_name',
  'published_at',
  'schedule',
  'title',
  'zone',
] as const;

export interface ServiceSnapshotDiff {
  readonly field: (typeof REVIEWED_SERVICE_FIELDS)[number];
  readonly previous: unknown;
  readonly current: unknown;
}

export function diffServiceSnapshots(
  previous: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
): readonly ServiceSnapshotDiff[] {
  return REVIEWED_SERVICE_FIELDS.flatMap((field) =>
    canonicalJson(previous[field]) === canonicalJson(current[field])
      ? []
      : [{ field, previous: previous[field], current: current[field] }],
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

type Client = Pick<SupabaseClient<Database>, 'auth' | 'from' | 'rpc'>;

const serviceReviewNotificationRowSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid(),
  previous_service: z.record(z.string(), z.unknown()),
  current_service: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

export interface ServiceReviewNotification {
  readonly id: string;
  readonly serviceId: string;
  readonly previousService: Readonly<Record<string, unknown>>;
  readonly currentService: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export async function fetchServiceReviewNotification(
  client: Client,
  rawNotificationId: string,
): Promise<ServiceReviewNotification> {
  const notificationId = z.uuid().parse(rawNotificationId);
  const { data, error } = await client
    .from('service_submission_notifications')
    .select('id, service_id, previous_service, current_service, created_at, read_at')
    .eq('id', notificationId)
    .eq('kind', 'published_edit')
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  const row = serviceReviewNotificationRowSchema.parse(data);
  return {
    id: row.id,
    serviceId: row.service_id,
    previousService: row.previous_service,
    currentService: row.current_service,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function markServiceReviewNotificationRead(
  client: Client,
  rawNotificationId: string,
): Promise<void> {
  const notificationId = z.uuid().parse(rawNotificationId);
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || authData.user === null) throw new AppError('AUTH-2');
  const { error } = await client
    .from('service_submission_notifications')
    .update({ read_at: new Date().toISOString(), read_by: authData.user.id })
    .eq('id', notificationId)
    .eq('kind', 'published_edit');
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function approveEntityService(
  client: Client,
  category: AdminServiceCategory,
  rawServiceId: string,
  rawInput: AdminServiceInput,
  rawComment: string | null,
): Promise<string> {
  const serviceId = z.uuid().parse(rawServiceId);
  const input = createAdminServiceInputSchema(category).parse(rawInput);
  if (input.status !== 'published') {
    throw new AppError('DB-1', { message: 'Approval requires a published service payload' });
  }
  const comment = z.string().trim().max(4_000).nullable().parse(rawComment);
  const { data, error } = await client.rpc(
    'review_entity_service' as never,
    {
      p_service_id: serviceId,
      p_decision: 'approve',
      p_payload: createAdminServiceRpcPayload(input, serviceId),
      p_comment: comment === '' ? null : comment,
    } as never,
  );
  if (error) throw new AppError('DB-1', { message: error.message });
  return z.uuid().parse(data);
}

export async function rejectEntityService(
  client: Client,
  rawServiceId: string,
  rawComment: string,
): Promise<string> {
  const serviceId = z.uuid().parse(rawServiceId);
  const comment = z.string().trim().min(1).max(4_000).parse(rawComment);
  const { data, error } = await client.rpc(
    'review_entity_service' as never,
    {
      p_service_id: serviceId,
      p_decision: 'reject',
      p_payload: null,
      p_comment: comment,
    } as never,
  );
  if (error) throw new AppError('DB-1', { message: error.message });
  return z.uuid().parse(data);
}

export async function fetchServiceReviewQueue(
  client: Client,
  rawSearch: ServiceReviewSearch,
): Promise<ServiceReviewQueuePage> {
  const search = serviceReviewSearchSchema.parse(rawSearch);
  const { data, error } = await client.rpc(
    'get_service_review_queue' as never,
    {
      p_kind: search.kind,
      p_category_id: search.category === 'all' ? null : search.category,
      p_query: search.query,
      p_page: search.page,
    } as never,
  );
  if (error) throw new AppError('DB-1', { message: error.message });
  const rows = z.array(serviceReviewQueueRowSchema).parse(data ?? []);
  const items = rows
    .map<ServiceReviewQueueItem>((row) => ({
      kind: row.item_kind,
      id: row.item_id,
      serviceId: row.service_id,
      categoryId: row.category_id,
      title: row.title,
      providerName: row.provider_name,
      contactName: row.contact_name,
      status: row.status,
      changedAt: row.changed_at,
      previousService: row.previous_service,
      currentService: row.current_service,
    }))
    .toSorted((left, right) => {
      const kindOrder =
        Number(left.kind === 'published_edit') - Number(right.kind === 'published_edit');
      if (kindOrder !== 0) return kindOrder;
      const dateOrder = left.changedAt.localeCompare(right.changedAt);
      return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
    });
  return { items, total: rows[0]?.total_count ?? 0 };
}
