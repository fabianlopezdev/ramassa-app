/**
 * Profile self-service actions (RAPP-22): thin, platform-neutral wrappers over
 * the two RPCs and the erasure-request table, shaped like `auth-actions` so both
 * apps call the same seam. Each takes the app's Supabase client (dependency
 * injection) and throws a typed `AppError` on failure, so the caller's wired
 * `safeAsync` logs it and turns it into a `Result`.
 *
 * ABSENT and FAILED are different return paths here, deliberately. A woman who
 * has not finished onboarding has no profile row, which is an expected state
 * with its own screen; a read that actually failed must never arrive looking
 * like an empty profile, or the edit screen would cheerfully offer to overwrite
 * a real one with blanks.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import type { ProfileRow, UpdateOwnProfilePayload } from '../schemas/profile';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/**
 * The caller's own profile with the encrypted columns decrypted server-side, or
 * null when she has none yet. The RPC takes no argument: there is no id to pass
 * and therefore no id to get wrong.
 */
export async function fetchOwnProfile(client: Client): Promise<ProfileRow | null> {
  const { data, error } = await client.rpc('get_own_profile');
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const rows = (data ?? []) as ProfileRow[];
  return rows[0] ?? null;
}

/** Writes an edited profile through the re-encrypting RPC. */
export async function updateOwnProfile(
  client: Client,
  payload: UpdateOwnProfilePayload,
): Promise<void> {
  const { error } = await client.rpc('update_own_profile', { payload });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}

export interface RequestOwnDeletionParams {
  readonly profileId: string;
  /** Her own words. Optional: giving a reason is not a condition of the right. */
  readonly reason?: string;
}

export async function requestOwnDeletion(
  client: Client,
  params: RequestOwnDeletionParams,
): Promise<void> {
  const { error } = await client
    .from('deletion_requests')
    .insert({ profile_id: params.profileId, reason: params.reason ?? null });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}

export interface OwnDeletionRequest {
  readonly id: string;
  readonly state: string;
  readonly created_at: string;
}

/**
 * The most recent request this participant filed, so the screen can tell her it
 * arrived instead of inviting her to file it again.
 */
export async function fetchOwnDeletionRequest(
  client: Client,
  profileId: string,
): Promise<OwnDeletionRequest | null> {
  const { data, error } = await client
    .from('deletion_requests')
    .select('id, state, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return (data as OwnDeletionRequest | null) ?? null;
}
