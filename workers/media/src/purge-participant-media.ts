/**
 * Removing every object a participant ever uploaded, so her erasure can proceed
 * (RAPP-26 scope item 3; ADR-023).
 *
 * WHY THIS ENDPOINT EXISTS AT ALL
 *
 * Erasure runs as a Postgres function (ADR-022: this project has no
 * service-role key, and the function that erases is the last one that should
 * hold a key able to read everything). Postgres cannot reach R2. This Worker
 * already verifies Supabase tokens against JWKS and reads role from `profiles`
 * under RLS, and it already holds the bucket binding, so the sweep belongs here
 * and needs no new secret.
 *
 * WHY THE SWEEP RUNS BEFORE THE RECORD IS DELETED
 *
 * The two halves cannot share a transaction. Media-first means the only
 * possible partial failure leaves her record present and the operation
 * retryable; record-first would leave objects in a bucket with nothing left to
 * say whose they were. This handler is idempotent for exactly that reason.
 *
 * WHY POSTGRES STILL WON'T TAKE THE CALLER'S WORD FOR IT
 *
 * On success this writes a `profile.media_purged` row to the audit trail, in
 * the admin's own name, through the ordinary insert policy and nothing wider.
 * `delete_participant_permanently()` refuses to run without a fresh one, so a
 * client that skips this call cannot delete the rows.
 *
 * THE TENANT PREFIX IS NEVER TAKEN FROM THE REQUEST. It comes from the caller's
 * own profile, exactly as upload keys are generated (ADR-010), so there is no
 * field an attacker could set to reach another organization's objects.
 */

import { AppError, isAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { purgeParticipantMediaRequestSchema, UPLOAD_FOLDERS } from '@ramassa/shared/schemas';
import { errorResponse, jsonResponse } from './http';
import type { CallerIdentity } from './supabase-identity';

/**
 * The slice of the R2 binding this handler uses. Narrow on purpose: a test can
 * supply an in-memory bucket, and nothing here can reach a capability it was
 * not given.
 */
export interface MediaBucket {
  list(options: { readonly prefix: string; readonly cursor?: string }): Promise<{
    readonly objects: readonly { readonly key: string }[];
    readonly truncated: boolean;
    readonly cursor?: string;
  }>;
  delete(keys: string | string[]): Promise<void>;
}

export interface PurgeReceipt {
  readonly participantId: string;
  readonly objectsDeleted: number;
  /**
   * Who swept, and for which tenant. Passed out rather than resolved again by
   * the caller: a second lookup could disagree with the one this handler
   * actually authorized against, and the receipt must name the identity that
   * did the work.
   */
  readonly identity: CallerIdentity;
}

export interface PurgeParticipantMediaDependencies {
  readonly resolveIdentity: (request: Request) => Promise<CallerIdentity>;
  readonly bucket: MediaBucket;
  /** Writes the audit row Postgres checks for. Injected, so the policy is testable offline. */
  readonly recordReceipt: (receipt: PurgeReceipt) => Promise<void>;
  readonly corsHeaders?: Record<string, string>;
  readonly onError?: (error: unknown, context: Record<string, unknown>) => void;
}

export interface PurgeParticipantMediaResponse {
  readonly objectsDeleted: number;
}

/** R2 accepts at most 1000 keys per delete call. */
const DELETE_BATCH_SIZE = 1_000;

/**
 * A ceiling on the drain loop below, not a limit on how much a participant may
 * have uploaded: at 1000 objects a round it covers a hundred thousand objects,
 * far beyond anything one person on this roster will hold.
 */
const MAXIMUM_ROUNDS = 100;

async function readJsonBody(request: Request): Promise<unknown | undefined> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Every key under one folder for one participant.
 *
 * THE TRAILING SLASH IS THE WHOLE SAFETY PROPERTY. Object keys are
 * `<orgId>/<folder>/<uploaderId>/<year>/<month>/<name>`, so a prefix that
 * stopped at the id would also match every id that merely BEGINS with it, and
 * erasing one woman would destroy another woman's photographs with nothing
 * anywhere to record that it happened.
 */
function buildParticipantPrefix(orgId: string, folder: string, participantId: string): string {
  return `${orgId}/${folder}/${participantId}/`;
}

async function deleteEveryObjectUnder(bucket: MediaBucket, prefix: string): Promise<number> {
  let deleted = 0;

  // LISTED FROM THE START EVERY ROUND, never by following the cursor.
  //
  // A cursor is a position in the listing, and this loop is deleting the very
  // objects it is walking, so each page removed shifts everything after it and a
  // cursor-driven walk skips as many objects as it deleted. The first draft did
  // exactly that and left three of seven photographs in the bucket while
  // reporting all seven gone. Re-listing is one extra call per page and cannot
  // skip: the prefix simply drains until nothing matches.
  for (let round = 0; round < MAXIMUM_ROUNDS; round += 1) {
    const listed = await bucket.list({ prefix });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length === 0) {
      return deleted;
    }

    for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
      const batch = keys.slice(start, start + DELETE_BATCH_SIZE);
      await bucket.delete(batch);
      deleted += batch.length;
    }
  }

  // Bounded so a bucket that keeps returning keys it never deletes fails loudly
  // instead of spinning. Reaching this means no receipt is written and the
  // erasure stays refused, which is the correct end for a sweep that cannot
  // prove it finished.
  throw new AppError('UPLOAD-7', {
    message: `Purge did not drain ${prefix} within ${MAXIMUM_ROUNDS} rounds`,
  });
}

export async function handlePurgeParticipantMedia(
  request: Request,
  dependencies: PurgeParticipantMediaDependencies,
): Promise<Response> {
  const corsHeaders = dependencies.corsHeaders ?? {};
  const fail = (code: AppErrorCode): Response => errorResponse(code, corsHeaders);

  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST', ...corsHeaders } });
  }

  let identity: CallerIdentity;
  try {
    identity = await dependencies.resolveIdentity(request);
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'identity' });
    return fail(isAppError(thrown) ? thrown.code : 'AUTH-2');
  }

  // The same boundary Postgres draws on the erasure itself (ADR-023). Staff run
  // the day-to-day record; destroying what a participant uploaded is part of
  // ending it, and ending it stops at the admin.
  if (identity.role !== 'admin') {
    return fail('AUTH-3');
  }

  const body = await readJsonBody(request);
  const parsed = purgeParticipantMediaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail('VALIDATION-1');
  }

  const participantId = parsed.data.participantId;

  let objectsDeleted = 0;
  try {
    for (const folder of UPLOAD_FOLDERS) {
      objectsDeleted += await deleteEveryObjectUnder(
        dependencies.bucket,
        // `identity.orgId`, never a value from the request.
        buildParticipantPrefix(identity.orgId, folder, participantId),
      );
    }
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'purge', participantId });
    // Deliberately no receipt: a receipt for a sweep that did not finish would
    // unlock an erasure and strand whatever is left in the bucket.
    return fail('UPLOAD-7');
  }

  try {
    await dependencies.recordReceipt({ participantId, objectsDeleted, identity });
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'receipt', participantId });
    // The objects ARE gone at this point, and saying so would be worse than
    // failing: the erasure would then be refused by Postgres for a reason this
    // screen never mentioned. Re-running is safe and writes the receipt.
    return fail('UPLOAD-7');
  }

  const response: PurgeParticipantMediaResponse = { objectsDeleted };
  return jsonResponse(response, { status: 200, headers: corsHeaders });
}
