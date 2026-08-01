/**
 * Creating an account for a participant with no email, and resetting its
 * password later (RAPP-25). The client seam over the SECURITY DEFINER RPCs
 * (ADR-022): takes the app's Supabase client, throws a typed `AppError`, and
 * lets the caller's wired `safeAsync` do the logging.
 *
 * The returned PASSWORD exists in the RPC's response and nowhere else, ever.
 * That has two consequences here. An empty or missing result is a FAILURE,
 * never a value: a layer that shrugged and returned blanks would render a
 * credentials panel with an empty password over an account that was really
 * created, and that woman can never log in. And nothing in this file logs,
 * stores or interpolates the credential; it flows to the caller and dies with
 * the screen that showed it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import type { CreateParticipantAccountPayload } from '../schemas/accounts';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/** The RPC's single row: the account, and the only sighting of its password. */
export interface CreatedParticipantAccount {
  readonly profile_id: string;
  readonly email: string;
  readonly password: string;
}

export async function createParticipantAccount(
  client: Client,
  payload: CreateParticipantAccountPayload,
): Promise<CreatedParticipantAccount> {
  const { data, error } = await client.rpc('create_participant_account', { payload });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const created = ((data ?? []) as CreatedParticipantAccount[])[0];
  if (created === undefined || created.password === '') {
    throw new AppError('DB-1', { message: 'create_participant_account returned no credentials' });
  }
  return created;
}

/**
 * A new one-time password for an admin-created account, invalidating the old
 * one. The RPC refuses magic-link accounts (they have no password); that
 * refusal arrives here as a failure the screen translates, never as an empty
 * string offered to a copy button.
 */
export async function resetParticipantPassword(
  client: Client,
  participantId: string,
): Promise<string> {
  const { data, error } = await client.rpc('reset_participant_password', {
    participant_id: participantId,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  if (typeof data !== 'string' || data === '') {
    throw new AppError('DB-1', { message: 'reset_participant_password returned no password' });
  }
  return data;
}
