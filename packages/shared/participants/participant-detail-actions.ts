/**
 * Reading and changing one participant, as staff (RAPP-24). Shaped like the
 * other shared actions: takes the app's Supabase client, throws a typed
 * `AppError`, and lets the caller's wired `safeAsync` do the logging.
 *
 * ABSENT and FAILED are different return paths here, deliberately, and the
 * stakes are higher than they are for a player reading herself. A participant
 * this caller may not read must arrive as `null`, never as a profile whose
 * fields happen to be empty, because the edit form would then cheerfully offer
 * to overwrite a real record with blanks.
 *
 * Every sensitive read goes through `get_participant_profile`, which decrypts
 * and writes its RGPD access-audit row in the SAME statement. There is no
 * unaudited path to a participant's document number, phone or address, and
 * there is nothing for a future edit of this file to forget.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import { answerPayload } from '../intake-builder/builder';
import {
  fetchSystemFieldIndex,
  hasFieldColumns,
  withAppColumns,
  withFieldAnswers,
} from '../intake-builder/field-answers';
import {
  profileRecordSchema,
  type ProfileRecordWithFields,
  type ProfileUpdate,
  type UpdateOwnProfilePayload,
} from '../schemas/profile';
import type { Database, Json } from '../types/database';
import {
  PARTICIPANT_NOTE_COLUMNS,
  type ParticipantActivityEntry,
  type ParticipantDetailRow,
  type ParticipantNoteRow,
} from './participant-detail';
import type { ProfilePrefillPayload } from './participant-prefill';

type Client = SupabaseClient<Database>;

/**
 * One participant with her encrypted fields decrypted, or null when there is no
 * such participant this caller may read. Reading her WRITES an audit row: that
 * is the point of routing through the RPC rather than selecting the columns.
 */
export async function fetchParticipantDetail(
  client: Client,
  participantId: string,
): Promise<ParticipantDetailRow | null> {
  const { data, error } = await client.rpc('get_participant_profile', {
    participant_id: participantId,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const row = (data ?? [])[0];
  if (row === undefined) return null;
  // Her answers arrive by field (RAPP-662); her page still reads her profile's
  // column names until it renders every field (RAPP-664).
  return (await withAppColumns(client, row)) as unknown as ParticipantDetailRow;
}

/**
 * Writes an edited participant through the re-encrypting staff RPC.
 *
 * The payload type is the player-side one ON PURPOSE. Both RPCs read the same
 * snake_case keys because the admin form composes them with
 * `buildUpdateOwnProfilePayload`, the same mapper the player app uses; a
 * staff-only copy of that mapper is precisely the second source of truth this
 * issue exists to avoid.
 */
export async function updateParticipantProfile(
  client: Client,
  participantId: string,
  // A full record, or only the changed fields of a woman who has not joined yet (RAPP-300).
  payload: UpdateOwnProfilePayload | ProfilePrefillPayload,
): Promise<void> {
  // Her names and settings on her account, every other answer by field
  // (RAPP-661). Her page still speaks in her profile's column names until it
  // renders every field (RAPP-664).
  const fields = hasFieldColumns(payload) ? await fetchSystemFieldIndex(client) : new Map();
  const { error } = await client.rpc('update_participant_profile', {
    participant_id: participantId,
    payload: withFieldAnswers(fields, payload),
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}

/** Her record as staff read it (RAPP-662): her account, the team's columns, her answers by field. */
const participantRecordSchema = profileRecordSchema.extend({
  is_active: z.boolean(),
  is_forum_banned: z.boolean(),
  anonymized_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  is_test_account: z.boolean(),
  role: z.string(),
});

/**
 * A participant as the staff phone reads her (RAPP-663): her record, with her
 * organization's app fields, so each answer is read by field and shown at its
 * field's level.
 */
export interface ParticipantRecord
  extends z.infer<typeof participantRecordSchema>, ProfileRecordWithFields {}

/**
 * One participant with her answers by field, each one the caller may read, or
 * null when there is no such participant this caller may read. Reading her
 * WRITES an audit row, as `fetchParticipantDetail` does.
 */
export async function fetchParticipantRecord(
  client: Client,
  participantId: string,
): Promise<ParticipantRecord | null> {
  const { data, error } = await client.rpc('get_participant_profile', {
    participant_id: participantId,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const row: unknown = (data ?? [])[0];
  if (row === undefined) return null;
  const parsed = participantRecordSchema.safeParse(row);
  if (!parsed.success) {
    // The field names only: her record is personal data.
    throw new AppError('DB-1', {
      message: 'get_participant_profile returned a row this app does not understand',
      context: { invalidFields: parsed.error.issues.map((issue) => issue.path.join('.')) },
    });
  }
  return { ...parsed.data, fields: await fetchSystemFieldIndex(client) };
}

/**
 * What staff send for her record: her names and settings when they changed
 * them, and her answers by field. A Sensitive answer stays as stored for a
 * caller who may not read it.
 */
export interface ParticipantUpdate {
  readonly first_name?: string;
  readonly last_name?: string;
  readonly preferred_language?: string | null;
  readonly media_consent?: boolean;
  readonly season_number?: number | null;
  readonly answers: ProfileUpdate['answers'];
}

/** Writes her record by field through the re-encrypting staff RPC (RAPP-663). */
export async function updateParticipantRecord(
  client: Client,
  participantId: string,
  update: ParticipantUpdate,
): Promise<void> {
  const { error } = await client.rpc('update_participant_profile', {
    participant_id: participantId,
    payload: { ...update, answers: answerPayload(update.answers) } as Json,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}

/** Flips a participant between active and inactive, audited under its own action. */
export async function setParticipantActive(
  client: Client,
  participantId: string,
  nextIsActive: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_participant_active', {
    participant_id: participantId,
    next_is_active: nextIsActive,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}

/**
 * The note thread, newest first. Ordering happens in the database rather than
 * in the browser so it stays right when a long-running participant's thread
 * outgrows one screen.
 */
export async function fetchParticipantNotes(
  client: Client,
  participantId: string,
): Promise<readonly ParticipantNoteRow[]> {
  const { data, error } = await client
    .from('participant_notes')
    .select(PARTICIPANT_NOTE_COLUMNS)
    .eq('profile_id', participantId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return (data ?? []) as unknown as ParticipantNoteRow[];
}

export interface AddParticipantNoteParams {
  readonly participantId: string;
  /** The signed-in staff member. The RLS policy checks it; the column has no default. */
  readonly authorId: string;
  readonly body: string;
}

export async function addParticipantNote(
  client: Client,
  params: AddParticipantNoteParams,
): Promise<void> {
  const { error } = await client.from('participant_notes').insert({
    profile_id: params.participantId,
    author_id: params.authorId,
    body: params.body,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}

/**
 * The activity timeline. Empty until later phases add their branch to
 * `public.participant_activity()`, and an empty LIST rather than an absence:
 * "she has done nothing yet" is a state the screen renders, not a failure.
 */
export async function fetchParticipantActivity(
  client: Client,
  participantId: string,
): Promise<readonly ParticipantActivityEntry[]> {
  const { data, error } = await client.rpc('participant_activity', {
    participant_id: participantId,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return (data ?? []) as unknown as ParticipantActivityEntry[];
}
