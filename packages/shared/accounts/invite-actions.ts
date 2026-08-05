/**
 * The invite fetches (RAPP-25): staff sending and listing invitations, and the
 * wizard's lookup of the invite waiting for the signed-in address.
 *
 * `fetchMyPendingInvite` deliberately passes NOTHING to the RPC. The address
 * comes from the verified JWT server-side, so there is no argument a client
 * bug (or a hostile client) could widen to somebody else's invite. Keep it
 * that way.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import { withCancellation, type CancellableRequest } from '../lib/cancellation';
import type { CreateParticipantInvitePayload } from '../schemas/accounts';
import type { Database } from '../types/database';
import { INVITE_COLUMNS, type InviteRow } from './invites';

type Client = SupabaseClient<Database>;

/** The recorded invitation: who it is for, and how long it stays valid. */
export interface CreatedParticipantInvite {
  readonly invite_id: string;
  readonly email: string;
  readonly expires_at: string;
}

export async function createParticipantInvite(
  client: Client,
  payload: CreateParticipantInvitePayload,
): Promise<CreatedParticipantInvite> {
  const { data, error } = await client.rpc('create_participant_invite', { payload });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const created = ((data ?? []) as CreatedParticipantInvite[])[0];
  if (created === undefined) {
    throw new AppError('DB-1', { message: 'create_participant_invite returned no row' });
  }
  return created;
}

/**
 * Every invitation this organization has sent, newest first. Ordering happens
 * in the database, same as the notes thread: it stays right when the list
 * outgrows one screen.
 */
export async function fetchInvites(client: Client): Promise<readonly InviteRow[]> {
  const { data, error } = await client
    .from('invites')
    .select(INVITE_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return (data ?? []) as unknown as InviteRow[];
}

/** The entity default an invite carries into the wizard, if one is waiting. */
export interface PendingInvite {
  readonly reference_entity: string | null;
  readonly invited_at: string;
}

/**
 * The pending invitation for the signed-in address, or null. Null is the
 * NORMAL case (most players sign up uninvited), so it is a value the wizard
 * shrugs at; only a FAILED read throws, and the wizard treats that the same
 * as no invite rather than blocking onboarding on a prefill.
 */
export async function fetchMyPendingInvite(
  client: Client,
  options: CancellableRequest = {},
): Promise<PendingInvite | null> {
  const { data, error } = await withCancellation(client.rpc('my_pending_invite'), options);
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const rows = (data ?? []) as PendingInvite[];
  return rows[0] ?? null;
}
