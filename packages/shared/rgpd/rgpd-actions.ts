/**
 * The RGPD lifecycle as app code sees it (RAPP-26): anonymize, erase, and work
 * the queue of erasure requests participants raise from their own profile
 * (RAPP-22).
 *
 * Shaped like the other shared actions: takes the app's Supabase client, throws
 * a typed `AppError`, and lets the caller's wired `safeAsync` log it. One
 * exception, `eraseParticipant`, which orchestrates two systems and therefore
 * returns a `Result` rather than throwing: its failure modes are outcomes a
 * screen has to explain, not exceptions to bubble.
 *
 * WHY THE DATABASE'S REFUSALS ARE TRANSLATED HERE
 *
 * `delete_participant_permanently()` refuses for reasons a staff member can act
 * on: the media has not been swept yet, the record is not hers to erase, the
 * purge did not complete and was rolled back. Collapsing all of those into
 * "database operation failed" would leave her staring at a screen that tells her
 * nothing, on the one action she cannot retry blindly. The RPC therefore raises
 * with a stable TOKEN at the front of its message and this module maps the
 * token, so the prose stays free to change without breaking the mapping.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, safeAsync, type Result } from '../errors';
import type { AppErrorCode } from '../errors/codes';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/**
 * The tokens `delete_participant_permanently()` and `anonymize_participant()`
 * raise with, and the code each becomes. Order matters only in that every token
 * is checked before the generic fallback.
 */
const ERASURE_ERROR_CODE_BY_TOKEN: readonly (readonly [string, AppErrorCode])[] = [
  ['DELETION_MEDIA_NOT_PURGED', 'DB-4'],
  ['DELETION_INCOMPLETE', 'DB-3'],
  ['DELETION_NO_SUBJECT', 'DB-2'],
  ['DELETION_NOT_A_PARTICIPANT', 'DB-2'],
  ['DELETION_SELF', 'DB-2'],
  ['ANONYMIZE_NO_SUBJECT', 'DB-2'],
  ['ANONYMIZE_NOT_A_PARTICIPANT', 'DB-2'],
  ['ANONYMIZE_ALREADY_DONE', 'DB-2'],
];

function toTypedError(message: string): AppError {
  const matched = ERASURE_ERROR_CODE_BY_TOKEN.find(([token]) => message.startsWith(token));
  return new AppError(matched?.[1] ?? 'DB-1', { message });
}

/**
 * Removes the person from a participant record and keeps the row countable.
 * Irreversible: the values are gone, not hidden.
 */
export async function anonymizeParticipant(client: Client, participantId: string): Promise<void> {
  const { error } = await client.rpc('anonymize_participant', {
    participant_id: participantId,
  });
  if (error) {
    throw toTypedError(error.message);
  }
}

/**
 * Erases the RECORD half only. Almost nothing should call this directly: the
 * RPC refuses without a fresh media receipt, so `eraseParticipant` below is the
 * whole act, and this is the second of its two steps.
 */
export async function deleteParticipantPermanently(
  client: Client,
  participantId: string,
): Promise<void> {
  const { error } = await client.rpc('delete_participant_permanently', {
    participant_id: participantId,
  });
  if (error) {
    throw toTypedError(error.message);
  }
}

export interface ErasureDependencies {
  /** Sweeps her objects from R2 and records the receipt Postgres will check. */
  readonly purgeMedia: () => Promise<Result<{ readonly objectsDeleted: number }, AppError>>;
  readonly deleteRecord: () => Promise<void>;
}

export interface ErasureOutcome {
  readonly objectsDeleted: number;
}

/**
 * The whole erasure: her stored objects, then her record.
 *
 * THE ORDER IS THE SAFETY PROPERTY, not a style choice (ADR-023). The two halves
 * live in two systems and cannot share a transaction, so the sequence decides
 * which way a partial failure falls. Media first means a failure leaves her
 * record present, the audit trail showing a sweep with no matching erasure, and
 * the whole thing safely retryable. Record first would leave objects in a bucket
 * with nothing left to say whose they were, which is not an erasure at all.
 *
 * The sweep runs even for a participant who uploaded nothing: it is what writes
 * the receipt the database requires, so skipping it as an optimization would
 * break erasure for exactly the participants with no media, who are most of them.
 */
export async function eraseParticipant(
  participantId: string,
  dependencies: ErasureDependencies,
): Promise<Result<ErasureOutcome, AppError>> {
  const purged = await dependencies.purgeMedia();
  if (!purged.ok) {
    return purged;
  }

  return safeAsync(
    async () => {
      await dependencies.deleteRecord();
      return { objectsDeleted: purged.value.objectsDeleted };
    },
    { code: 'DB-1', context: { participantId } },
  );
}

export interface DeletionRequestRow {
  readonly id: string;
  readonly profile_id: string;
  readonly reason: string | null;
  readonly state: string;
  readonly created_at: string;
  readonly resolution_note: string | null;
  readonly resolved_at: string | null;
}

export const DELETION_REQUEST_COLUMNS =
  'id, profile_id, reason, state, created_at, resolution_note, resolved_at';

/**
 * The queue a participant fills from her own profile (RAPP-22) and staff work
 * from here. Asking is not doing: this reads the asks, and the erasure remains a
 * separate, admin-only act with its own confirmation.
 */
export async function fetchDeletionRequests(
  client: Client,
  state: 'open' | 'in_progress' | 'done' | 'declined',
): Promise<readonly DeletionRequestRow[]> {
  const { data, error } = await client
    .from('deletion_requests')
    .select(DELETION_REQUEST_COLUMNS)
    .eq('state', state)
    .order('created_at', { ascending: false });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return (data ?? []) as DeletionRequestRow[];
}

export interface ResolveDeletionRequestParams {
  readonly requestId: string;
  readonly state: 'in_progress' | 'done' | 'declined';
  readonly resolvedBy: string;
  /** What staff did about it, which is the part RGPD expects to be answerable. */
  readonly resolutionNote?: string;
}

export async function resolveDeletionRequest(
  client: Client,
  params: ResolveDeletionRequestParams,
): Promise<void> {
  const { error } = await client
    .from('deletion_requests')
    .update({
      state: params.state,
      resolved_by: params.resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution_note: params.resolutionNote ?? null,
    })
    .eq('id', params.requestId);
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}
