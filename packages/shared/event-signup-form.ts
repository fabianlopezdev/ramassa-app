/**
 * The questions an activity asks when she signs up (RAPP-941): a form of the
 * engine tied to one activity, with questions staff add on its board. Her
 * answers are kept with her sign-up, never on her record.
 *
 * Her phone reads the activity's form with `fetchEventSignupForm` (null when
 * the activity asks nothing), walks it over the catalog `intake_catalog` sent
 * (`eventSignupFormCatalog`), and signs her up with her answers through
 * `signUpForEvent`. The database signs her up with the rules her own write
 * meets (the sign-up mode, the places, an activity she may read) and checks
 * her answers against the form as it is now, a required question included.
 * An installed build keeps writing `event_signups` directly, without answers.
 *
 * Staff read each sign-up with her answers through `fetchEventSignupAnswers`,
 * under the rule that reads the sign-up; the activity editor opens the form
 * with `openEventSignupForm`, which makes it when the activity has none.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { EVENT_SIGNUP_STATES, mapEventSignupError, type PlayerEventSignup } from './events';
import type { IntakeCatalog } from './intake-builder/builder';
import { anyLanguageTextSchema, type BuilderText } from './intake-builder/profile-layout';
import { formContentCatalog } from './intake-builder/survey-forms';
import { formAnswersSchema, type FormAnswer } from './on-demand-form';
import type { Database } from './types/database';

type RpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

/** An activity's sign-up form as she fills it in now: its screens and its questions. */
export interface EventSignupForm {
  readonly formId: string;
  readonly eventId: string;
  readonly name: BuilderText;
  /** Its screens and placements, each naming its question, the shape a survey version has. */
  readonly content: unknown;
}

const eventSignupFormSchema = z.object({
  form_id: z.uuid(),
  event_id: z.uuid(),
  name: anyLanguageTextSchema.catch({}),
  content: z.unknown(),
});

/** The activity's sign-up form for the player signed in; null when the activity asks nothing. */
export async function fetchEventSignupForm(
  client: RpcClient,
  eventId: string,
  signal?: AbortSignal,
): Promise<EventSignupForm | null> {
  let query = client.rpc('event_signup_form', { p_event_id: eventId });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  const parsed = eventSignupFormSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    formId: parsed.data.form_id,
    eventId: parsed.data.event_id,
    name: parsed.data.name,
    content: parsed.data.content,
  };
}

/**
 * The catalog her phone walks the sign-up form with: the catalog
 * `intake_catalog` sent (`raw`, which never holds a sign-up form or its
 * questions), with the form laid over it.
 */
export function eventSignupFormCatalog(
  raw: unknown,
  form: EventSignupForm,
  readAt: string = new Date().toISOString(),
): IntakeCatalog {
  return formContentCatalog(raw, {
    formId: form.formId,
    name: form.name,
    kind: 'signup',
    systemKey: null,
    eventId: form.eventId,
    closesAt: null,
    version: 1,
    readAt,
    content: form.content,
  });
}

/** What her phone needs to walk an activity's sign-up form: the catalog as sent, and the form. */
export async function fetchEventSignupFormSource(
  client: RpcClient,
  eventId: string,
): Promise<{ readonly raw: unknown; readonly form: EventSignupForm | null }> {
  const [catalog, form] = await Promise.all([
    client.rpc('intake_catalog' as never),
    fetchEventSignupForm(client, eventId),
  ]);
  if (catalog.error) databaseFailure(catalog.error.message);
  return { raw: catalog.data, form };
}

const signupSchema = z.object({
  id: z.uuid(),
  state: z.enum(EVENT_SIGNUP_STATES),
  updated_at: z.string(),
});

/**
 * Signs her up for an activity with her answers to its questions, by question
 * id; an unanswered optional question is left out. Already signed up, she keeps
 * her place and her answers are replaced. A full activity fails with the same
 * error her own write meets (`EVENTS-1`).
 */
export async function signUpForEvent(
  client: RpcClient,
  eventId: string,
  answers: Readonly<Record<string, unknown>>,
): Promise<PlayerEventSignup> {
  const { data, error } = await client.rpc('sign_up_for_event', {
    p_event_id: eventId,
    p_answers: answers as Database['public']['Functions']['sign_up_for_event']['Args']['p_answers'],
  });
  if (error) throw mapEventSignupError(error);
  return signupSchema.parse(data);
}

/** One sign-up to an activity with her answers, as the team reads it. */
export interface EventSignupWithAnswers {
  readonly signupId: string;
  readonly playerId: string;
  /** Her name at the level the reader may read it. */
  readonly firstName: string;
  readonly lastName: string;
  readonly state: (typeof EVENT_SIGNUP_STATES)[number];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Her answers, each with the question as she read it; none from an installed build. */
  readonly answers: readonly FormAnswer[];
}

const signupAnswersRowSchema = z.object({
  signup_id: z.uuid(),
  player_id: z.uuid(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  state: z.enum(EVENT_SIGNUP_STATES),
  created_at: z.string(),
  updated_at: z.string(),
  answers: formAnswersSchema,
});

/** Each sign-up to an activity with her answers, oldest first, for whoever reads its sign-ups. */
export async function fetchEventSignupAnswers(
  client: RpcClient,
  eventId: string,
  signal?: AbortSignal,
): Promise<readonly EventSignupWithAnswers[]> {
  let query = client.rpc('event_signup_answers', { p_event_id: eventId });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(signupAnswersRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      signupId: row.signup_id,
      playerId: row.player_id,
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      answers: row.answers,
    }));
}

/** The activity's sign-up form, made when it has none: its id, for the board. */
export async function openEventSignupForm(client: RpcClient, eventId: string): Promise<string> {
  const { data, error } = await client.rpc('open_event_signup_form', { p_event_id: eventId });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}
