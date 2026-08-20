import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { Database } from './types/database';

export const MENTORING_TOPICS = [
  'personal_development',
  'labor_orientation',
  'asylum_rights',
  'gender_violence',
  'empowerment',
  'digital_skills',
  'other',
] as const;
export const MENTORING_STATUSES = ['requested', 'scheduled', 'completed', 'cancelled'] as const;

export type MentoringTopic = (typeof MENTORING_TOPICS)[number];
export type MentoringStatus = (typeof MENTORING_STATUSES)[number];

const nullableTrimmedText = (maximum: number) =>
  z
    .union([z.string().trim().max(maximum), z.null()])
    .transform((value) => (value === null || value.length === 0 ? null : value));
const nullableDate = z
  .union([z.iso.date(), z.literal(''), z.null()])
  .transform((value) => (value === '' ? null : value));
const nullableTime = z
  .union([z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), z.literal(''), z.null()])
  .transform((value) => (value === '' ? null : value));

export const mentoringRequestSchema = z
  .object({
    topic: z.enum(MENTORING_TOPICS),
    topicDetail: nullableTrimmedText(2000),
    preferredDate: nullableDate,
    preferredTime: nullableTime,
  })
  .refine((request) => request.preferredTime === null || request.preferredDate !== null, {
    path: ['preferredTime'],
    message: 'A preferred time needs a preferred date',
  });

export type MentoringRequestInput = z.input<typeof mentoringRequestSchema>;
export type MentoringRequestValues = z.output<typeof mentoringRequestSchema>;

const ownRequestRowSchema = z.object({
  id: z.uuid(),
  topic: z.enum(MENTORING_TOPICS),
  topic_detail: z.string().nullable(),
  preferred_date: z.string().nullable(),
  preferred_time: z.string().nullable(),
  status: z.enum(MENTORING_STATUSES),
  scheduled_at: z.string().nullable(),
  assigned_staff_name: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const staffRequestRowSchema = ownRequestRowSchema.extend({
  player_id: z.uuid(),
  player_first_name: z.string(),
  player_last_name: z.string(),
  assigned_staff_id: z.uuid().nullable(),
  staff_notes: z.string().nullable(),
});

export interface MentoringRequest {
  readonly id: string;
  readonly topic: MentoringTopic;
  readonly topicDetail: string | null;
  readonly preferredDate: string | null;
  readonly preferredTime: string | null;
  readonly status: MentoringStatus;
  readonly scheduledAt: string | null;
  readonly assignedStaffName: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StaffMentoringRequest extends MentoringRequest {
  readonly playerId: string;
  readonly playerFirstName: string;
  readonly playerLastName: string;
  readonly assignedStaffId: string | null;
  readonly staffNotes: string | null;
}

export interface PrivateMentoringCalendarEntry {
  readonly id: string;
  readonly status: 'scheduled' | 'completed';
  readonly scheduledAt: string;
  readonly assignedStaffName: string | null;
}

type Client = SupabaseClient<Database>;
type RpcClient = Pick<Client, 'rpc'>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

function mentoringRequestFromRow(row: z.infer<typeof ownRequestRowSchema>): MentoringRequest {
  return {
    id: row.id,
    topic: row.topic,
    topicDetail: row.topic_detail,
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time,
    status: row.status,
    scheduledAt: row.scheduled_at,
    assignedStaffName: row.assigned_staff_name,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createMentoringRequest(
  client: RpcClient,
  input: MentoringRequestValues,
): Promise<string> {
  const request = mentoringRequestSchema.parse(input);
  const { data, error } = await client.rpc(
    'create_mentoring_request' as never,
    {
      p_topic: request.topic,
      p_topic_detail: request.topicDetail,
      p_preferred_date: request.preferredDate,
      p_preferred_time: request.preferredTime,
    } as never,
  );
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function fetchOwnMentoringRequests(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly MentoringRequest[]> {
  let query = client.rpc('list_own_mentoring_requests');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(ownRequestRowSchema)
    .parse(data ?? [])
    .map(mentoringRequestFromRow);
}

export async function fetchStaffMentoringRequests(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly StaffMentoringRequest[]> {
  let query = client.rpc('list_staff_mentoring_requests');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(staffRequestRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      ...mentoringRequestFromRow(row),
      playerId: row.player_id,
      playerFirstName: row.player_first_name,
      playerLastName: row.player_last_name,
      assignedStaffId: row.assigned_staff_id,
      staffNotes: row.staff_notes,
    }));
}

export async function scheduleMentoringRequest(
  client: RpcClient,
  input: {
    readonly requestId: string;
    readonly scheduledAt: string;
    readonly assignedStaffId: string;
    readonly staffNotes: string | null;
  },
): Promise<void> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      scheduledAt: z.iso.datetime(),
      assignedStaffId: z.uuid(),
      staffNotes: nullableTrimmedText(2000),
    })
    .parse(input);
  const { error } = await client.rpc(
    'schedule_mentoring_request' as never,
    {
      p_request_id: parsed.requestId,
      p_scheduled_at: parsed.scheduledAt,
      p_assigned_staff_id: parsed.assignedStaffId,
      p_staff_notes: parsed.staffNotes,
    } as never,
  );
  if (error) databaseFailure(error.message);
}

export async function completeMentoringRequest(
  client: RpcClient,
  requestId: string,
): Promise<void> {
  const { error } = await client.rpc('complete_mentoring_request', {
    p_request_id: z.uuid().parse(requestId),
  });
  if (error) databaseFailure(error.message);
}

export function summarizeMentoringTopics(
  requests: readonly Pick<MentoringRequest, 'topic'>[],
): readonly { readonly topic: MentoringTopic; readonly count: number }[] {
  const counts = new Map<MentoringTopic, number>();
  for (const request of requests) counts.set(request.topic, (counts.get(request.topic) ?? 0) + 1);
  return [...counts]
    .map(([topic, count]) => ({ topic, count }))
    .toSorted((a, b) => b.count - a.count);
}

export function getPrivateMentoringCalendarEntries(
  requests: readonly MentoringRequest[],
): readonly PrivateMentoringCalendarEntry[] {
  return requests.flatMap((request) =>
    (request.status === 'scheduled' || request.status === 'completed') &&
    request.scheduledAt !== null
      ? [
          {
            id: request.id,
            status: request.status,
            scheduledAt: request.scheduledAt,
            assignedStaffName: request.assignedStaffName,
          },
        ]
      : [],
  );
}
