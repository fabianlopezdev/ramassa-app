import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database, Json } from '../types/database';
import {
  createServiceCategoryContract,
  SERVICE_METADATA_FIELD_TYPES,
  type ServiceCategoryContract,
  type ServiceCategoryDefinition,
  type ServiceLocalizedLabel,
} from './definitions';
import { SERVICE_AVAILABILITIES, SERVICE_COST_TYPES } from './filters';
import { SERVICE_SUBMISSION_STATUSES } from './state-machine';

const completeLocalizedTextSchema = z.object({
  ca: z.string().trim().min(1),
  es: z.string().trim().min(1),
  en: z.string().trim().min(1),
  ar: z.string().trim().min(1),
  fa: z.string().trim().min(1),
});

const draftLocalizedTextSchema = z.object({
  ca: z.string().trim().min(1),
  es: z.string().trim().min(1).optional(),
  en: z.string().trim().min(1).optional(),
  ar: z.string().trim().min(1).optional(),
  fa: z.string().trim().min(1).optional(),
});

const localizedLabelSchema = completeLocalizedTextSchema;

export const serviceMetadataFieldDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: localizedLabelSchema,
    type: z.enum(SERVICE_METADATA_FIELD_TYPES),
    required: z.boolean(),
    filterable: z.boolean(),
    options: z.array(z.string().trim().min(1)).min(1).optional(),
    minimum: z.number().finite().optional(),
  })
  .superRefine((field, context) => {
    if ((field.type === 'select' || field.type === 'string-array') && field.options === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Select fields require options',
      });
    }
    if (field.options !== undefined && new Set(field.options).size !== field.options.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'Options must be unique' });
    }
    if (field.minimum !== undefined && field.type !== 'number') {
      context.addIssue({
        code: 'custom',
        path: ['minimum'],
        message: 'Only number fields may define a minimum',
      });
    }
  });

export const serviceMetadataSchemaDefinitionSchema = z
  .object({ fields: z.array(serviceMetadataFieldDefinitionSchema).max(50) })
  .superRefine((schema, context) => {
    const keys = schema.fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', path: ['fields'], message: 'Field keys must be unique' });
    }
  });

const serviceCategoryDatabaseRowSchema = z.object({
  id: z.uuid(),
  name: localizedLabelSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  icon: z.string().trim().min(1),
  color: z.string().trim().min(1),
  sort_order: z.number().int().nonnegative(),
  metadata_schema: serviceMetadataSchemaDefinitionSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export interface AdminServiceCategory {
  readonly id: string;
  readonly name: ServiceLocalizedLabel;
  readonly slug: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly metadataSchema: z.infer<typeof serviceMetadataSchemaDefinitionSchema>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly definition: ServiceCategoryDefinition;
  readonly contract: ServiceCategoryContract;
}

type Client = SupabaseClient<Database>;

export function parseServiceCategoryRow(raw: unknown): AdminServiceCategory {
  const row = serviceCategoryDatabaseRowSchema.parse(raw);
  const definition: ServiceCategoryDefinition = {
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    fields: row.metadata_schema.fields,
  };
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    metadataSchema: row.metadata_schema,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    definition,
    contract: createServiceCategoryContract(definition),
  };
}

const adminServiceInputBaseSchema = z.object({
  categoryId: z.uuid(),
  title: draftLocalizedTextSchema,
  description: draftLocalizedTextSchema.nullable(),
  providerName: z.string().trim().min(1).max(200).nullable(),
  location: z.string().trim().min(1).max(500).nullable(),
  zone: z.string().trim().min(1).max(200).nullable(),
  costType: z.enum(SERVICE_COST_TYPES),
  costAmount: z.number().finite().nonnegative().nullable(),
  costDetails: z.string().trim().min(1).max(1_000).nullable(),
  contactName: z.string().trim().min(1).max(200).nullable(),
  contactPhone: z.string().trim().min(1).max(50).nullable(),
  contactEmail: z.email().nullable(),
  contactRole: z.string().trim().min(1).max(200).nullable(),
  schedule: z.string().trim().min(1).max(1_000).nullable(),
  externalUrl: z
    .url()
    .refine((url) => url.startsWith('https://'))
    .nullable(),
  availability: z.enum(SERVICE_AVAILABILITIES),
  metadata: z.record(z.string(), z.unknown()),
  status: z.enum(['draft', 'published']),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  images: z
    .array(
      z.object({
        url: z.string().trim().min(1),
        altText: draftLocalizedTextSchema,
      }),
    )
    .max(12),
});

export type AdminServiceInput = z.infer<typeof adminServiceInputBaseSchema>;

const adminServiceDatabaseRowSchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  title: draftLocalizedTextSchema,
  description: draftLocalizedTextSchema.nullable(),
  provider_name: z.string().nullable(),
  location: z.string().nullable(),
  zone: z.string().nullable(),
  cost_type: z.enum(SERVICE_COST_TYPES),
  cost_amount: z.number().nullable(),
  cost_details: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_role: z.string().nullable(),
  schedule: z.string().nullable(),
  external_url: z.string().nullable(),
  availability: z.enum(SERVICE_AVAILABILITIES),
  metadata: z.record(z.string(), z.unknown()),
  status: z.enum(SERVICE_SUBMISSION_STATUSES),
  published_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  submitted_by: z.string().nullable(),
  created_by: z.string().nullable(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  rejection_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const serviceImageDatabaseRowSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid(),
  url: z.string().min(1),
  alt_text: draftLocalizedTextSchema,
  position: z.number().int().nonnegative(),
  created_at: z.string(),
});

export type AdminServiceRow = z.infer<typeof adminServiceDatabaseRowSchema>;
export type AdminServiceImageRow = z.infer<typeof serviceImageDatabaseRowSchema>;
export interface AdminServiceDetail {
  readonly service: AdminServiceRow;
  readonly images: readonly AdminServiceImageRow[];
}

export interface AdminServicePage {
  readonly rows: readonly AdminServiceRow[];
  readonly total: number;
}

export const ADMIN_SERVICE_PAGE_SIZE = 25;
export const SERVICE_LIFECYCLES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'published',
  'scheduled',
  'expired',
] as const;
export const SERVICE_STATUS_FILTERS = ['all', ...SERVICE_LIFECYCLES] as const;
export type ServiceLifecycle = (typeof SERVICE_LIFECYCLES)[number];

export const serviceSearchSchema = z.object({
  category: z
    .union([z.literal('all'), z.uuid()])
    .catch('all')
    .default('all'),
  status: z.enum(SERVICE_STATUS_FILTERS).catch('all').default('all'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type ServiceSearch = z.infer<typeof serviceSearchSchema>;

export interface ServiceSchedule {
  readonly status: string;
  readonly publishedAt: string | null;
  readonly expiresAt: string | null;
}

export function getServiceLifecycle(service: ServiceSchedule, now = new Date()): ServiceLifecycle {
  if (service.status !== 'published') {
    return z.enum(['draft', 'pending', 'approved', 'rejected']).parse(service.status);
  }
  if (service.expiresAt !== null && new Date(service.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  if (service.publishedAt === null || new Date(service.publishedAt).getTime() > now.getTime()) {
    return 'scheduled';
  }
  return 'published';
}

export interface AdminServiceQueryBuilder {
  eq(column: string, value: unknown): AdminServiceQueryBuilder;
  gt(column: string, value: unknown): AdminServiceQueryBuilder;
  lte(column: string, value: unknown): AdminServiceQueryBuilder;
  or(filters: string): AdminServiceQueryBuilder;
  order(
    column: string,
    options: { readonly ascending: boolean; readonly nullsFirst?: boolean },
  ): AdminServiceQueryBuilder;
  range(from: number, to: number): AdminServiceQueryBuilder;
}

export function applyAdminServiceQuery<Query extends AdminServiceQueryBuilder>(
  initialQuery: Query,
  search: ServiceSearch,
  now = new Date(),
): Query {
  let query = initialQuery;
  const timestamp = now.toISOString();
  if (search.category !== 'all') query = query.eq('category_id', search.category) as Query;
  if (search.status === 'published') {
    query = query.eq('status', 'published').lte('published_at', timestamp) as Query;
    query = query.or(`expires_at.is.null,expires_at.gt.${timestamp}`) as Query;
  } else if (search.status === 'scheduled') {
    query = query.eq('status', 'published').gt('published_at', timestamp) as Query;
  } else if (search.status === 'expired') {
    query = query.eq('status', 'published').lte('expires_at', timestamp) as Query;
  } else if (search.status !== 'all') {
    query = query.eq('status', search.status) as Query;
  }
  query = query.order('updated_at', { ascending: false }) as Query;
  query = query.order('id', { ascending: true }) as Query;
  const from = (search.page - 1) * ADMIN_SERVICE_PAGE_SIZE;
  return query.range(from, from + ADMIN_SERVICE_PAGE_SIZE - 1) as Query;
}

const SERVICE_CATEGORY_COLUMNS =
  'id, name, slug, icon, color, sort_order, metadata_schema, created_at, updated_at';
const ADMIN_SERVICE_COLUMNS =
  'id, category_id, title, description, provider_name, location, zone, cost_type, cost_amount, cost_details, contact_name, contact_phone, contact_email, contact_role, schedule, external_url, availability, metadata, status, published_at, expires_at, submitted_by, created_by, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at';
const SERVICE_IMAGE_COLUMNS = 'id, service_id, url, alt_text, position, created_at';

export async function fetchServiceCategories(
  client: Client,
): Promise<readonly AdminServiceCategory[]> {
  const { data, error } = await client
    .from('service_categories')
    .select(SERVICE_CATEGORY_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []).map(parseServiceCategoryRow);
}

export async function fetchAdminServices(
  client: Client,
  search: ServiceSearch,
  now = new Date(),
): Promise<AdminServicePage> {
  const base = client.from('services').select(ADMIN_SERVICE_COLUMNS, { count: 'exact' });
  const { data, error, count } = await applyAdminServiceQuery(base as never, search, now);
  if (error) throw new AppError('DB-1', { message: (error as { message: string }).message });
  return {
    rows: z.array(adminServiceDatabaseRowSchema).parse(data ?? []),
    total: count ?? 0,
  };
}

export async function fetchAdminService(
  client: Client,
  serviceId: string,
): Promise<AdminServiceDetail> {
  const servicePromise = client
    .from('services')
    .select(ADMIN_SERVICE_COLUMNS)
    .eq('id', serviceId)
    .single();
  const imagesPromise = client
    .from('service_images')
    .select(SERVICE_IMAGE_COLUMNS)
    .eq('service_id', serviceId)
    .order('position', { ascending: true });
  const [serviceResult, imageResult] = await Promise.all([servicePromise, imagesPromise]);
  if (serviceResult.error) {
    throw new AppError('DB-1', { message: serviceResult.error.message });
  }
  if (imageResult.error) throw new AppError('DB-1', { message: imageResult.error.message });
  return {
    service: adminServiceDatabaseRowSchema.parse(serviceResult.data),
    images: z.array(serviceImageDatabaseRowSchema).parse(imageResult.data ?? []),
  };
}

function rpcPayload(input: AdminServiceInput, serviceId: string | null): Json {
  return {
    serviceId,
    categoryId: input.categoryId,
    title: input.title,
    description: input.description,
    providerName: input.providerName,
    location: input.location,
    zone: input.zone,
    costType: input.costType,
    costAmount: input.costAmount,
    costDetails: input.costDetails,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
    contactRole: input.contactRole,
    schedule: input.schedule,
    externalUrl: input.externalUrl,
    availability: input.availability,
    metadata: input.metadata as Json,
    status: input.status,
    publishedAt: input.publishedAt,
    expiresAt: input.expiresAt,
    images: input.images.map((image) => ({ url: image.url, altText: image.altText })),
  };
}

export async function saveAdminService(
  client: Pick<Client, 'rpc'>,
  category: AdminServiceCategory,
  rawInput: AdminServiceInput,
  serviceId: string | null,
): Promise<string> {
  const input = createAdminServiceInputSchema(category).parse(rawInput);
  const { data, error } = await client.rpc('save_admin_service', {
    p_payload: rpcPayload(input, serviceId),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  return z.uuid().parse(data);
}

export async function deleteAdminService(client: Client, serviceId: string): Promise<void> {
  const { error } = await client.from('services').delete().eq('id', serviceId);
  if (error) throw new AppError('DB-1', { message: error.message });
}

export const serviceCategoryInputSchema = z.object({
  name: localizedLabelSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  icon: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(100),
  metadataSchema: serviceMetadataSchemaDefinitionSchema,
});
export type ServiceCategoryInput = z.infer<typeof serviceCategoryInputSchema>;

function categoryValues(input: ServiceCategoryInput) {
  return {
    name: input.name,
    slug: input.slug,
    icon: input.icon,
    color: input.color,
    metadata_schema: input.metadataSchema,
  };
}

export async function createServiceCategory(
  client: Client,
  rawInput: ServiceCategoryInput,
): Promise<AdminServiceCategory> {
  const input = serviceCategoryInputSchema.parse(rawInput);
  const categories = await fetchServiceCategories(client);
  const { data, error } = await client
    .from('service_categories')
    .insert({ ...categoryValues(input), sort_order: (categories.length + 1) * 10 })
    .select(SERVICE_CATEGORY_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return parseServiceCategoryRow(data);
}

export async function countServicesIncompatibleWithCategorySchema(
  client: Client,
  categoryId: string,
  rawMetadataSchema: unknown,
): Promise<number> {
  const metadataSchema = serviceMetadataSchemaDefinitionSchema.parse(rawMetadataSchema);
  const { data, error } = await client.rpc('count_services_incompatible_with_category_schema', {
    p_category_id: categoryId,
    p_metadata_schema: metadataSchema,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  return z.coerce.number().int().nonnegative().parse(data);
}

export async function updateServiceCategory(
  client: Client,
  categoryId: string,
  rawInput: ServiceCategoryInput,
): Promise<AdminServiceCategory> {
  const input = serviceCategoryInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('service_categories')
    .update(categoryValues(input))
    .eq('id', categoryId)
    .select(SERVICE_CATEGORY_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return parseServiceCategoryRow(data);
}

export async function deleteServiceCategory(client: Client, categoryId: string): Promise<void> {
  const { error } = await client.from('service_categories').delete().eq('id', categoryId);
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function reorderServiceCategories(
  client: Client,
  categoryIds: readonly string[],
): Promise<void> {
  const parsedIds = z.array(z.uuid()).min(1).parse(categoryIds);
  const { error } = await client.rpc('reorder_service_categories', {
    p_category_ids: parsedIds,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

export function moveServiceCategory(
  categoryIds: readonly string[],
  sourceId: string,
  targetId: string,
): readonly string[] {
  const sourceIndex = categoryIds.indexOf(sourceId);
  const targetIndex = categoryIds.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return categoryIds;
  const next = [...categoryIds];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source!);
  return next;
}

export function createAdminServiceInputSchema(category: AdminServiceCategory) {
  return adminServiceInputBaseSchema.superRefine((service, context) => {
    if (service.categoryId !== category.id) {
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'The selected category does not match the validation contract',
      });
    }
    const metadata = category.contract.metadataSchema.safeParse(service.metadata);
    if (!metadata.success) {
      for (const issue of metadata.error.issues) {
        context.addIssue({
          code: 'custom',
          path: ['metadata', ...issue.path],
          message: issue.message,
        });
      }
    }
    if (service.costType === 'free' && service.costAmount !== null) {
      context.addIssue({
        code: 'custom',
        path: ['costAmount'],
        message: 'A free service cannot have a cost amount',
      });
    }
    if (
      (service.costType === 'paid' || service.costType === 'subsidized') &&
      service.costAmount === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['costAmount'],
        message: 'Paid and subsidized services require a cost amount',
      });
    }
    if (
      service.expiresAt !== null &&
      (service.publishedAt === null ||
        new Date(service.expiresAt).getTime() <= new Date(service.publishedAt).getTime())
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Expiry must be later than publication',
      });
    }
    if (service.status !== 'published') return;
    if (service.publishedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Published services require a publication time',
      });
    }
    for (const [field, value] of [
      ['title', service.title],
      ['description', service.description],
    ] as const) {
      if (value !== null && !completeLocalizedTextSchema.safeParse(value).success) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Every language must be complete before publication',
        });
      }
    }
    for (const [index, image] of service.images.entries()) {
      if (!completeLocalizedTextSchema.safeParse(image.altText).success) {
        context.addIssue({
          code: 'custom',
          path: ['images', index, 'altText'],
          message: 'Every image alt text language must be complete before publication',
        });
      }
    }
  });
}
