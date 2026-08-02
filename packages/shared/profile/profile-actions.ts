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
import type { z } from 'zod';
import { AppError } from '../errors';
import { withCancellation, type CancellableRequest } from '../lib/cancellation';
import {
  ownDeletionRequestSchema,
  profileRowSchema,
  type OwnDeletionRequest,
  type ProfileRow,
  type UpdateOwnProfilePayload,
} from '../schemas/profile';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/**
 * Parses a response the network handed us (contract rule 6) and reports a
 * mismatch as the DB failure it is, rather than letting a cast paint missing
 * columns onto the screen as blank answers.
 *
 * Only the FIELD PATHS of the mismatch go into the error context, never the
 * values: this payload is decrypted PII and an AppError is the one object that
 * is guaranteed to reach Sentry.
 */
function parseRow<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  source: string,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('DB-1', {
      message: `${source} returned a row this app does not understand`,
      context: { source, invalidFields: result.error.issues.map((issue) => issue.path.join('.')) },
    });
  }
  return result.data;
}

/**
 * The caller's own profile with the encrypted columns decrypted server-side, or
 * null when she has none yet. The RPC takes no argument: there is no id to pass
 * and therefore no id to get wrong.
 */
export async function fetchOwnProfile(
  client: Client,
  options: CancellableRequest = {},
): Promise<ProfileRow | null> {
  const { data, error } = await withCancellation(client.rpc('get_own_profile'), options);
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const rows = data ?? [];
  const first: unknown = Array.isArray(rows) ? rows[0] : undefined;
  // Absent stays absent: no row is the expected state for a woman who has not
  // finished onboarding, and it must not be parsed as a malformed one.
  return first === undefined || first === null
    ? null
    : parseRow(profileRowSchema, first, 'get_own_profile');
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

export type { OwnDeletionRequest };

/**
 * The most recent request this participant filed, so the screen can tell her it
 * arrived instead of inviting her to file it again.
 */
export async function fetchOwnDeletionRequest(
  client: Client,
  profileId: string,
  options: CancellableRequest = {},
): Promise<OwnDeletionRequest | null> {
  // Cancellation is applied BEFORE `.maybeSingle()`: `.abortSignal()` lives on
  // the transform builder, and the terminal single-row shapes do not carry it.
  const { data, error } = await withCancellation(
    client
      .from('deletion_requests')
      .select('id, state, created_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1),
    options,
  ).maybeSingle();
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  // `maybeSingle` returns null for "she has never asked", which is the common
  // case and not a failure. Anything else is parsed before the banner trusts it.
  return data === null || data === undefined
    ? null
    : parseRow(ownDeletionRequestSchema, data, 'deletion_requests');
}
