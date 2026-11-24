import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { CustomQuestion, IntakeCatalog } from './intake-builder/builder';
import {
  fetchMyOnDemandForm,
  fetchMyOnDemandFormSource,
  formAnswerQuestion,
  formAnswersSchema,
  onDemandFormCatalog,
  type FormAnswer,
  type OnDemandForm,
} from './on-demand-form';
import type { Database } from './types/database';

export const FEEDBACK_TYPES = ['activity_proposal', 'idea', 'problem', 'general'] as const;
export const FEEDBACK_STATUSES = ['new', 'read', 'in_progress', 'resolved'] as const;
export const FEEDBACK_CONTENT_MAX_LENGTH = 2000;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

const feedbackObjectKeySchema = z
  .string()
  .regex(
    /^[0-9a-f-]+\/feedback\/[0-9a-f-]+\/\d{4}\/(?:0[1-9]|1[0-2])\/[0-9a-f]{32}\.(?:jpg|png|webp)$/i,
  );

export const feedbackSubmissionSchema = z.object({
  type: z.enum(FEEDBACK_TYPES),
  content: z.string().trim().min(1).max(FEEDBACK_CONTENT_MAX_LENGTH),
  imageObjectKey: feedbackObjectKeySchema.nullish().transform((value) => value ?? null),
});

export const feedbackTransitionSchema = z.object({
  submissionId: z.uuid(),
  status: z.enum(FEEDBACK_STATUSES),
});

const ownFeedbackRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(FEEDBACK_TYPES),
  content: z.string(),
  image_url: z.string().nullable(),
  status: z.enum(FEEDBACK_STATUSES),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const staffFeedbackRowSchema = ownFeedbackRowSchema.extend({
  author_id: z.uuid(),
  author_first_name: z.string(),
  author_last_name: z.string(),
  resolved_by: z.uuid().nullable(),
  conversation_id: z.uuid(),
  // A server before RAPP-939 sends none.
  answers: formAnswersSchema.optional(),
});

const monthlyCountRowSchema = z.object({
  month: z.string(),
  type: z.enum(FEEDBACK_TYPES),
  count: z.coerce.number().int().nonnegative(),
});

export type FeedbackSubmissionInput = z.input<typeof feedbackSubmissionSchema>;
export type FeedbackSubmissionValues = z.output<typeof feedbackSubmissionSchema>;

export interface FeedbackSubmission {
  readonly id: string;
  readonly type: FeedbackType;
  readonly content: string;
  readonly imageObjectKey: string | null;
  readonly status: FeedbackStatus;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * One answer to a question staff added to the suggestions form (RAPP-939),
 * with the question as she read it: the inbox reads it even after the
 * question changes. The mentoring form's answers are the same (RAPP-940).
 */
export type FeedbackAnswer = FormAnswer;

export interface StaffFeedbackSubmission extends FeedbackSubmission {
  readonly authorId: string;
  readonly authorFirstName: string;
  readonly authorLastName: string;
  readonly resolvedBy: string | null;
  readonly conversationId: string;
  /** Her answers to the questions staff added (RAPP-939), in the form's order. */
  readonly answers: readonly FeedbackAnswer[];
}

export interface FeedbackMonthlyCount {
  readonly month: string;
  readonly type: FeedbackType;
  readonly count: number;
}

type Client = SupabaseClient<Database>;
type RpcClient = Pick<Client, 'rpc'>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

function feedbackFromRow(row: z.infer<typeof ownFeedbackRowSchema>): FeedbackSubmission {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    imageObjectKey: row.image_url,
    status: row.status,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createFeedbackSubmission(
  client: RpcClient,
  input: FeedbackSubmissionValues,
): Promise<string> {
  const submission = feedbackSubmissionSchema.parse(input);
  const { data, error } = await client.rpc(
    'create_feedback_submission' as never,
    {
      p_type: submission.type,
      p_content: submission.content,
      p_image_url: submission.imageObjectKey,
    } as never,
  );
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function fetchOwnFeedbackSubmissions(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly FeedbackSubmission[]> {
  let query = client.rpc('list_own_feedback_submissions' as never);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(ownFeedbackRowSchema)
    .parse(data ?? [])
    .map(feedbackFromRow);
}

export async function fetchStaffFeedbackSubmissions(
  client: RpcClient,
  filters: { readonly type?: FeedbackType; readonly status?: FeedbackStatus } = {},
  signal?: AbortSignal,
): Promise<readonly StaffFeedbackSubmission[]> {
  let query = client.rpc(
    'list_staff_feedback_submissions' as never,
    { p_type: filters.type ?? null, p_status: filters.status ?? null } as never,
  );
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(staffFeedbackRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      ...feedbackFromRow(row),
      authorId: row.author_id,
      authorFirstName: row.author_first_name,
      authorLastName: row.author_last_name,
      resolvedBy: row.resolved_by,
      conversationId: row.conversation_id,
      answers: row.answers ?? [],
    }));
}

/** An answer's question, so the shared answer text reads its value (an option's label, a yes). */
export function feedbackAnswerQuestion(answer: FeedbackAnswer): CustomQuestion {
  return formAnswerQuestion(answer);
}

// The suggestions form on her phone (RAPP-939) ---------------------------------------------------

/**
 * The screen that holds a suggestion's type, text and photo: the form's
 * fixed parts. Staff add screens and questions around it.
 */
export const FEEDBACK_MESSAGE_SCREEN = 'feedback_message';

/** The suggestions form as she fills it in now: its screens and its questions. */
export type FeedbackForm = OnDemandForm;

/** The suggestions form; null from a server before it. */
export async function fetchMyFeedbackForm(client: RpcClient): Promise<FeedbackForm | null> {
  return fetchMyOnDemandForm(client, 'feedback');
}

/**
 * The catalog her phone walks the suggestions form with: the catalog
 * `intake_catalog` sent (`raw`, which never holds this form or its
 * questions), with the form laid over it. Its fixed screen is the one whose
 * `systemScreen` is `FEEDBACK_MESSAGE_SCREEN`.
 */
export function feedbackFormCatalog(
  raw: unknown,
  form: FeedbackForm,
  readAt: string = new Date().toISOString(),
): IntakeCatalog {
  return onDemandFormCatalog(raw, 'feedback', form, readAt);
}

/** What her phone needs to walk the suggestions form: the catalog as sent, and the form. */
export async function fetchMyFeedbackFormSource(
  client: RpcClient,
): Promise<{ readonly raw: unknown; readonly form: FeedbackForm | null }> {
  return fetchMyOnDemandFormSource(client, 'feedback');
}

/**
 * A suggestion with her answers to the questions staff added, by question
 * id; an unanswered optional question is left out. The database checks the
 * answers against the form as it is now, a required one included.
 */
export async function sendFeedbackSubmission(
  client: RpcClient,
  input: FeedbackSubmissionValues,
  answers: Readonly<Record<string, unknown>>,
): Promise<string> {
  const submission = feedbackSubmissionSchema.parse(input);
  const { data, error } = await client.rpc(
    'send_feedback_submission' as never,
    {
      p_type: submission.type,
      p_content: submission.content,
      p_image_url: submission.imageObjectKey,
      p_answers: answers,
    } as never,
  );
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function transitionFeedbackSubmission(
  client: RpcClient,
  input: z.input<typeof feedbackTransitionSchema>,
): Promise<void> {
  const transition = feedbackTransitionSchema.parse(input);
  const { error } = await client.rpc(
    'transition_feedback_submission' as never,
    { p_submission_id: transition.submissionId, p_status: transition.status } as never,
  );
  if (error) databaseFailure(error.message);
}

export async function fetchFeedbackMonthlyCounts(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly FeedbackMonthlyCount[]> {
  let query = client.rpc('feedback_monthly_counts' as never);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z.array(monthlyCountRowSchema).parse(data ?? []);
}

export function getFeedbackConversationPath(conversationId: string): string {
  return `/messages/${z.uuid().parse(conversationId)}`;
}
