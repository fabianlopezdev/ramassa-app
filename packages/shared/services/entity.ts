import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database, Json } from '../types/database';
import type { AdminServiceCategory } from './admin';
import { SERVICE_AVAILABILITIES, SERVICE_COST_TYPES } from './filters';
import type { ServiceSubmissionStatus } from './state-machine';

export const ENTITY_SERVICE_ACTIONS = ['edit', 'delete', 'submit', 'resubmit'] as const;

export type EntityServiceAction = (typeof ENTITY_SERVICE_ACTIONS)[number];

const actionsByStatus: Readonly<Record<ServiceSubmissionStatus, readonly EntityServiceAction[]>> = {
  draft: ['edit', 'delete', 'submit'],
  pending: [],
  approved: [],
  rejected: ['edit', 'delete', 'resubmit'],
  published: ['edit'],
};

export function getEntityServiceActions(
  status: ServiceSubmissionStatus,
): readonly EntityServiceAction[] {
  return actionsByStatus[status];
}

const entityServiceInputBaseSchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10_000).nullable(),
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
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});

export type EntityServiceInput = z.infer<typeof entityServiceInputBaseSchema>;

export function createEntityServiceInputSchema(category: AdminServiceCategory) {
  return entityServiceInputBaseSchema.superRefine((service, context) => {
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
        message: 'Expiry must be later than the requested publication time',
      });
    }
  });
}

type Client = SupabaseClient<Database>;

const entityLocalizedTextSchema = z.object({
  ca: z.string().trim().min(1),
  es: z.string().trim().min(1).optional(),
  en: z.string().trim().min(1).optional(),
  ar: z.string().trim().min(1).optional(),
  fa: z.string().trim().min(1).optional(),
});

const entityServiceRowSchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  title: entityLocalizedTextSchema,
  description: entityLocalizedTextSchema.nullable(),
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
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'published']),
  published_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  rejection_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type EntityServiceRow = z.infer<typeof entityServiceRowSchema>;

const ENTITY_SERVICE_COLUMNS =
  'id, category_id, title, description, provider_name, location, zone, cost_type, cost_amount, cost_details, contact_name, contact_phone, contact_email, contact_role, schedule, external_url, availability, metadata, status, published_at, expires_at, rejection_reason, created_at, updated_at';

async function currentUserId(client: Pick<Client, 'auth'>): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || data.user === null) {
    throw new AppError('AUTH-2', { message: error?.message });
  }
  return data.user.id;
}

export async function fetchEntityServiceSubmissions(
  client: Client,
): Promise<readonly EntityServiceRow[]> {
  const userId = await currentUserId(client);
  const { data, error } = await client
    .from('services')
    .select(ENTITY_SERVICE_COLUMNS)
    .eq('submitted_by', userId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true });
  if (error) throw new AppError('DB-1', { message: error.message });
  return z.array(entityServiceRowSchema).parse(data ?? []);
}

export async function fetchEntityService(
  client: Client,
  serviceId: string,
): Promise<EntityServiceRow> {
  const userId = await currentUserId(client);
  const { data, error } = await client
    .from('services')
    .select(ENTITY_SERVICE_COLUMNS)
    .eq('id', z.uuid().parse(serviceId))
    .eq('submitted_by', userId)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return entityServiceRowSchema.parse(data);
}

export async function deleteEntityService(client: Client, serviceId: string): Promise<void> {
  const userId = await currentUserId(client);
  const { error } = await client
    .from('services')
    .delete()
    .eq('id', z.uuid().parse(serviceId))
    .eq('submitted_by', userId);
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function resubmitEntityService(
  client: Pick<Client, 'rpc'>,
  serviceId: string,
): Promise<void> {
  const { error } = await client.rpc('resubmit_entity_service', {
    p_service_id: z.uuid().parse(serviceId),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

const ownServiceContactRowSchema = z.object({
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_role: z.string().nullable(),
  provider_name: z.string().nullable(),
});

export interface OwnServiceContact {
  readonly name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly role: string | null;
  readonly providerName: string | null;
}

export async function fetchOwnServiceContacts(
  client: Pick<Client, 'rpc'>,
): Promise<readonly OwnServiceContact[]> {
  const { data, error } = await client.rpc('get_own_service_contacts');
  if (error) throw new AppError('DB-1', { message: error.message });
  return z
    .array(ownServiceContactRowSchema)
    .parse(data ?? [])
    .map((contact) => ({
      name: contact.contact_name,
      phone: contact.contact_phone,
      email: contact.contact_email,
      role: contact.contact_role,
      providerName: contact.provider_name,
    }));
}

const serviceSubmissionCommentRowSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid(),
  author_role: z.enum(['entity', 'staff', 'admin']),
  body: z.string().min(1).max(4_000),
  is_internal: z.boolean(),
  created_at: z.string(),
});

export interface ServiceSubmissionComment {
  readonly id: string;
  readonly serviceId: string;
  readonly authorRole: 'entity' | 'staff' | 'admin';
  readonly body: string;
  readonly isInternal: boolean;
  readonly createdAt: string;
}

function parseServiceSubmissionComment(raw: unknown): ServiceSubmissionComment {
  const row = serviceSubmissionCommentRowSchema.parse(raw);
  return {
    id: row.id,
    serviceId: row.service_id,
    authorRole: row.author_role,
    body: row.body,
    isInternal: row.is_internal,
    createdAt: row.created_at,
  };
}

const SERVICE_SUBMISSION_COMMENT_COLUMNS =
  'id, service_id, author_role, body, is_internal, created_at';

export async function fetchServiceSubmissionComments(
  client: Client,
  serviceId: string,
): Promise<readonly ServiceSubmissionComment[]> {
  const parsedServiceId = z.uuid().parse(serviceId);
  const { data, error } = await client
    .from('service_submission_comments')
    .select(SERVICE_SUBMISSION_COMMENT_COLUMNS)
    .eq('service_id', parsedServiceId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []).map(parseServiceSubmissionComment);
}

export async function addEntityServiceComment(
  client: Client,
  serviceId: string,
  rawBody: string,
): Promise<ServiceSubmissionComment> {
  const parsedServiceId = z.uuid().parse(serviceId);
  const body = z.string().trim().min(1).max(4_000).parse(rawBody);
  const { data, error } = await client
    .from('service_submission_comments')
    .insert({ service_id: parsedServiceId, body })
    .select(SERVICE_SUBMISSION_COMMENT_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return parseServiceSubmissionComment(data);
}

function entityServiceRpcPayload(input: EntityServiceInput, serviceId: string | null): Json {
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
    publishedAt: input.publishedAt,
    expiresAt: input.expiresAt,
  };
}

export async function saveEntityService(
  client: Pick<Client, 'rpc'>,
  category: AdminServiceCategory,
  rawInput: EntityServiceInput,
  serviceId: string | null,
): Promise<string> {
  const input = createEntityServiceInputSchema(category).parse(rawInput);
  const { data, error } = await client.rpc(
    'save_entity_service' as never,
    {
      p_payload: entityServiceRpcPayload(input, serviceId),
    } as never,
  );
  if (error) throw new AppError('DB-1', { message: error.message });
  return z.uuid().parse(data);
}
