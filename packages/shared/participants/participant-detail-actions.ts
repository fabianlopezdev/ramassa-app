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
import { AppError } from '../errors';
import type { UpdateOwnProfilePayload } from '../schemas/profile';
import type { Database } from '../types/database';
import {
  PARTICIPANT_NOTE_COLUMNS,
  type ParticipantActivityEntry,
  type ParticipantDetailRow,
  type ParticipantNoteRow,
} from './participant-detail';

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
  const rows = (data ?? []) as ParticipantDetailRow[];
  return rows[0] ?? null;
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
  payload: UpdateOwnProfilePayload,
): Promise<void> {
  const { error } = await client.rpc('update_participant_profile', {
    participant_id: participantId,
    payload,
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
