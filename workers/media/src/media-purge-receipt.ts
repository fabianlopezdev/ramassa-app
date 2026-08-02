/**
 * Writing the receipt Postgres checks before it will erase a participant's
 * record (RAPP-26, ADR-023).
 *
 * It is an ORDINARY INSERT through PostgREST, with the caller's own token, and
 * that is the point. The `audit_log_insert_self` policy already allows an
 * authenticated user to append a row in her own name and her own organization,
 * and nothing wider; this Worker therefore needs no elevated credential to
 * record what it just did, and the row it writes is subject to exactly the
 * checks any other audit row is.
 *
 * The row carries the COUNT of objects removed and nothing else. Object keys
 * contain the participant's id and could be reconstructed into a listing of
 * what she had uploaded, which is precisely the kind of detail ADR-021 keeps
 * out of a table nobody treats as sensitive.
 */

import { AppError } from '@ramassa/shared/errors';

export interface RecordMediaPurgeReceiptOptions {
  readonly actorId: string;
  readonly orgId: string;
  readonly participantId: string;
  readonly objectsDeleted: number;
  readonly token: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly fetchImplementation?: typeof fetch;
}

export const MEDIA_PURGED_AUDIT_ACTION = 'profile.media_purged';

export async function recordMediaPurgeReceipt(
  options: RecordMediaPurgeReceiptOptions,
): Promise<void> {
  const performFetch = options.fetchImplementation ?? fetch;

  const response = await performFetch(`${options.supabaseUrl}/rest/v1/audit_log`, {
    method: 'POST',
    headers: {
      apikey: options.supabasePublishableKey,
      Authorization: `Bearer ${options.token}`,
      'content-type': 'application/json',
      // Nothing is read back: the row is written for Postgres to check, not for
      // this Worker to inspect, and asking for it back would only widen what
      // this response could leak.
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      org_id: options.orgId,
      actor_id: options.actorId,
      action: MEDIA_PURGED_AUDIT_ACTION,
      target_type: 'profile',
      target_id: options.participantId,
      changes: { objects_deleted: options.objectsDeleted },
    }),
  });

  if (!response.ok) {
    throw new AppError('DB-1', {
      message: 'Could not record the media purge receipt',
      context: { status: response.status },
    });
  }
}
