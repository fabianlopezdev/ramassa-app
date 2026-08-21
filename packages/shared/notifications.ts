import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { isSupportedLanguage, type SupportedLanguage } from './i18n';
import type { Database, Json } from './types/database';

export const NOTIFICATION_AUDIENCE_KINDS = [
  'all',
  'interest',
  'signup',
  'entity',
  'custom_group',
] as const;
export const NOTIFICATION_TEMPLATE_CATEGORIES = [
  'transactional',
  'engagement',
  'marketing',
] as const;

export type NotificationAudienceKind = (typeof NOTIFICATION_AUDIENCE_KINDS)[number];
export type NotificationTemplateCategory = (typeof NOTIFICATION_TEMPLATE_CATEGORIES)[number];

const requiredCopy = z.string().trim().min(1).max(1000);
export const notificationContentSchema = z.object({
  ca: requiredCopy,
  es: requiredCopy,
  en: requiredCopy,
  ar: requiredCopy,
  fa: requiredCopy,
});
export const notificationTitleSchema = notificationContentSchema.refine(
  (copy) => Object.values(copy).every((value) => value.length <= 120),
  'notification titles cannot exceed 120 characters',
);

export type NotificationContent = z.infer<typeof notificationContentSchema>;

export const notificationAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('interest'), serviceCategoryId: z.uuid() }),
  z.object({ kind: z.literal('signup'), eventId: z.uuid() }),
  z.object({ kind: z.literal('entity'), entityName: z.string().trim().min(1).max(200) }),
  z.object({ kind: z.literal('custom_group'), customGroupId: z.uuid() }),
]);

export type NotificationAudience = z.infer<typeof notificationAudienceSchema>;

export const notificationSendInputSchema = z.object({
  templateId: z.uuid().nullable().default(null),
  title: notificationTitleSchema,
  body: notificationContentSchema,
  audience: notificationAudienceSchema,
  expectedRecipientCount: z.number().int().positive(),
});

export type NotificationSendInput = z.input<typeof notificationSendInputSchema>;

const templateRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.enum(NOTIFICATION_TEMPLATE_CATEGORIES),
  title: notificationTitleSchema,
  body: notificationContentSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
const groupMemberRowSchema = z.object({
  group_id: z.uuid(),
  participant_id: z.uuid(),
});
const audienceMemberRowSchema = z.object({
  participant_id: z.uuid(),
  full_name: z.string(),
  language: z.enum(['ca', 'es', 'en', 'ar', 'fa']),
  device_count: z.coerce.number().int().positive(),
});
const historyRowSchema = z.object({
  id: z.uuid(),
  template_id: z.uuid().nullable(),
  audience_kind: z.enum(NOTIFICATION_AUDIENCE_KINDS),
  audience_config: z.record(z.string(), z.unknown()),
  recipient_count: z.coerce.number().int().nonnegative(),
  device_count: z.coerce.number().int().nonnegative(),
  sent_count: z.coerce.number().int().nonnegative(),
  delivered_count: z.coerce.number().int().nonnegative(),
  failed_count: z.coerce.number().int().nonnegative(),
  state: z.enum(['pending', 'processing', 'awaiting_receipts', 'retrying', 'complete']),
  sent_by: z.uuid().nullable(),
  created_at: z.string(),
});

export interface NotificationTemplate {
  readonly id: string;
  readonly name: string;
  readonly category: NotificationTemplateCategory;
  readonly title: NotificationContent;
  readonly body: NotificationContent;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomNotificationGroup {
  readonly id: string;
  readonly name: string;
  readonly participantIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NotificationAudienceMember {
  readonly participantId: string;
  readonly fullName: string;
  readonly language: SupportedLanguage;
  readonly deviceCount: number;
}

export interface NotificationSendHistory {
  readonly id: string;
  readonly templateId: string | null;
  readonly audienceKind: NotificationAudienceKind;
  readonly audienceConfig: Readonly<Record<string, unknown>>;
  readonly recipientCount: number;
  readonly deviceCount: number;
  readonly sentCount: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly state: 'pending' | 'processing' | 'awaiting_receipts' | 'retrying' | 'complete';
  readonly sentBy: string | null;
  readonly createdAt: string;
}

export interface NotificationAudienceOptions {
  readonly serviceCategories: readonly { readonly id: string; readonly name: string }[];
  readonly events: readonly { readonly id: string; readonly title: string }[];
  readonly entities: readonly string[];
  readonly participants: readonly {
    readonly id: string;
    readonly fullName: string;
    readonly language: SupportedLanguage;
  }[];
}

type Client = SupabaseClient<Database>;
type RpcClient = Pick<Client, 'rpc'>;
type QueryClient = Pick<Client, 'from'>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

export function notificationAudienceArguments(audience: NotificationAudience): {
  kind: NotificationAudienceKind;
  config: Record<string, string>;
} {
  switch (audience.kind) {
    case 'all':
      return { kind: audience.kind, config: {} };
    case 'interest':
      return {
        kind: audience.kind,
        config: { service_category_id: audience.serviceCategoryId },
      };
    case 'signup':
      return { kind: audience.kind, config: { event_id: audience.eventId } };
    case 'entity':
      return { kind: audience.kind, config: { entity_name: audience.entityName } };
    case 'custom_group':
      return {
        kind: audience.kind,
        config: { custom_group_id: audience.customGroupId },
      };
  }
}

export function resolveNotificationCopy(copy: NotificationContent, language: string): string {
  return copy[isSupportedLanguage(language) ? language : 'ca'];
}

function localizedLabel(value: Json): string {
  const parsed = z.record(z.string(), z.string()).parse(value);
  return parsed.ca ?? parsed.es ?? parsed.en ?? Object.values(parsed)[0] ?? '';
}

export async function fetchNotificationAudienceOptions(
  client: QueryClient,
  signal?: AbortSignal,
): Promise<NotificationAudienceOptions> {
  let categoryQuery = client
    .from('service_categories')
    .select('id, name')
    .order('sort_order')
    .order('id');
  let eventQuery = client
    .from('events')
    .select('id, title')
    .order('starts_at', { ascending: false })
    .limit(100);
  let participantQuery = client
    .from('profiles')
    .select('id, first_name, last_name, preferred_language, reference_entity')
    .eq('role', 'player')
    .eq('is_active', true)
    .order('last_name')
    .order('first_name');
  if (signal !== undefined) {
    categoryQuery = categoryQuery.abortSignal(signal);
    eventQuery = eventQuery.abortSignal(signal);
    participantQuery = participantQuery.abortSignal(signal);
  }
  const [categoryResult, eventResult, participantResult] = await Promise.all([
    categoryQuery,
    eventQuery,
    participantQuery,
  ]);
  if (categoryResult.error) databaseFailure(categoryResult.error.message);
  if (eventResult.error) databaseFailure(eventResult.error.message);
  if (participantResult.error) databaseFailure(participantResult.error.message);

  const participants = z
    .array(
      z.object({
        id: z.uuid(),
        first_name: z.string(),
        last_name: z.string(),
        preferred_language: z.string(),
        reference_entity: z.string().nullable(),
      }),
    )
    .parse(participantResult.data ?? []);
  return {
    serviceCategories: (categoryResult.data ?? []).map((category) => ({
      id: category.id,
      name: localizedLabel(category.name),
    })),
    events: (eventResult.data ?? []).map((event) => ({
      id: event.id,
      title: localizedLabel(event.title),
    })),
    entities: [
      ...new Set(
        participants.flatMap((participant) =>
          participant.reference_entity === null ? [] : [participant.reference_entity],
        ),
      ),
    ].sort((left, right) => left.localeCompare(right)),
    participants: participants.map((participant) => ({
      id: participant.id,
      fullName: `${participant.first_name} ${participant.last_name}`.trim(),
      language: isSupportedLanguage(participant.preferred_language)
        ? participant.preferred_language
        : 'ca',
    })),
  };
}

export async function fetchNotificationTemplates(
  client: QueryClient,
  signal?: AbortSignal,
): Promise<readonly NotificationTemplate[]> {
  let query = client.from('notification_templates').select('*').order('name');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(templateRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export async function fetchCustomNotificationGroups(
  client: QueryClient,
  signal?: AbortSignal,
): Promise<readonly CustomNotificationGroup[]> {
  let groupsQuery = client.from('custom_notification_groups').select('*').order('name');
  let membersQuery = client
    .from('custom_notification_group_members')
    .select('group_id, participant_id')
    .order('participant_id');
  if (signal !== undefined) {
    groupsQuery = groupsQuery.abortSignal(signal);
    membersQuery = membersQuery.abortSignal(signal);
  }
  const [groupsResult, membersResult] = await Promise.all([groupsQuery, membersQuery]);
  if (groupsResult.error) databaseFailure(groupsResult.error.message);
  if (membersResult.error) databaseFailure(membersResult.error.message);
  const members = z.array(groupMemberRowSchema).parse(membersResult.data ?? []);
  return z
    .array(groupRowSchema)
    .parse(groupsResult.data ?? [])
    .map((group) => ({
      id: group.id,
      name: group.name,
      participantIds: members
        .filter((member) => member.group_id === group.id)
        .map((member) => member.participant_id),
      createdAt: group.created_at,
      updatedAt: group.updated_at,
    }));
}

export async function previewNotificationAudience(
  client: RpcClient,
  audience: NotificationAudience,
  signal?: AbortSignal,
): Promise<readonly NotificationAudienceMember[]> {
  const parsed = notificationAudienceSchema.parse(audience);
  const { kind, config } = notificationAudienceArguments(parsed);
  let query = client.rpc('preview_notification_audience', {
    p_audience_kind: kind,
    p_audience_config: config as Json,
  });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(audienceMemberRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      participantId: row.participant_id,
      fullName: row.full_name,
      language: row.language,
      deviceCount: row.device_count,
    }));
}

export async function saveNotificationTemplate(
  client: RpcClient,
  input: {
    readonly id?: string;
    readonly name: string;
    readonly category: NotificationTemplateCategory;
    readonly title: NotificationContent;
    readonly body: NotificationContent;
  },
): Promise<string> {
  const title = notificationTitleSchema.parse(input.title);
  const body = notificationContentSchema.parse(input.body);
  const { data, error } = await client.rpc('save_notification_template', {
    p_id: input.id ?? null,
    p_name: z.string().trim().min(1).max(80).parse(input.name),
    p_category: z.enum(NOTIFICATION_TEMPLATE_CATEGORIES).parse(input.category),
    p_title: title,
    p_body: body,
  } as never);
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function saveCustomNotificationGroup(
  client: RpcClient,
  input: {
    readonly id?: string;
    readonly name: string;
    readonly participantIds: readonly string[];
  },
): Promise<string> {
  const { data, error } = await client.rpc('save_custom_notification_group', {
    p_id: input.id ?? null,
    p_name: z.string().trim().min(1).max(80).parse(input.name),
    p_participant_ids: z.array(z.uuid()).parse(input.participantIds),
  } as never);
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function createTargetedNotificationSend(
  client: RpcClient,
  input: NotificationSendInput,
): Promise<string> {
  const send = notificationSendInputSchema.parse(input);
  const { kind, config } = notificationAudienceArguments(send.audience);
  const { data, error } = await client.rpc('create_targeted_notification_send', {
    p_template_id: send.templateId,
    p_title: send.title,
    p_body: send.body,
    p_audience_kind: kind,
    p_audience_config: config as Json,
    p_expected_recipient_count: send.expectedRecipientCount,
  } as never);
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function fetchNotificationSendHistory(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly NotificationSendHistory[]> {
  let query = client.rpc('list_notification_send_history');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(historyRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      templateId: row.template_id,
      audienceKind: row.audience_kind,
      audienceConfig: row.audience_config,
      recipientCount: row.recipient_count,
      deviceCount: row.device_count,
      sentCount: row.sent_count,
      deliveredCount: row.delivered_count,
      failedCount: row.failed_count,
      state: row.state,
      sentBy: row.sent_by,
      createdAt: row.created_at,
    }));
}
