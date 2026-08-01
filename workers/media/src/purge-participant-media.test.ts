import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import {
  handlePurgeParticipantMedia,
  type MediaBucket,
  type PurgeParticipantMediaDependencies,
} from './purge-participant-media';
import type { CallerIdentity } from './supabase-identity';

const ORG = '11111111-2222-3333-4444-555555555555';
const OTHER_ORG = '99999999-8888-7777-6666-555555555555';
const PARTICIPANT = '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e';

const admin: CallerIdentity = {
  userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  orgId: ORG,
  role: 'admin',
};
const staff: CallerIdentity = { ...admin, role: 'staff' };
const player: CallerIdentity = { ...admin, role: 'player' };
const entity: CallerIdentity = { ...admin, role: 'entity' };

/**
 * An in-memory stand-in for the R2 binding, holding whatever keys a test says
 * the bucket holds. It implements the pagination contract too (`truncated` plus
 * a cursor), because a purge that stops at the first page is a purge that
 * quietly leaves a participant's photographs in the bucket, and that bug is
 * invisible against a fixture holding three objects.
 */
function buildBucket(
  keys: readonly string[],
  pageSize = 1_000,
): MediaBucket & {
  readonly remaining: () => readonly string[];
  readonly listCalls: () => readonly string[];
} {
  let stored = [...keys];
  const listCalls: string[] = [];
  return {
    async list(options) {
      listCalls.push(options.prefix);
      const matching = stored.filter((key) => key.startsWith(options.prefix)).sort();
      const start = options.cursor === undefined ? 0 : Number(options.cursor);
      const page = matching.slice(start, start + pageSize);
      const nextStart = start + page.length;
      const truncated = nextStart < matching.length;
      return {
        objects: page.map((key) => ({ key })),
        truncated,
        cursor: truncated ? String(nextStart) : undefined,
      };
    },
    async delete(deleted) {
      const removing = new Set(Array.isArray(deleted) ? deleted : [deleted]);
      stored = stored.filter((key) => !removing.has(key));
    },
    remaining: () => stored,
    listCalls: () => listCalls,
  };
}

function buildRequest(body: unknown): Request {
  return new Request('https://media.example/participants/media', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function buildDependencies(
  overrides: Partial<PurgeParticipantMediaDependencies> = {},
): PurgeParticipantMediaDependencies {
  return {
    resolveIdentity: async () => admin,
    bucket: buildBucket([]),
    recordReceipt: async () => undefined,
    ...overrides,
  };
}

async function readErrorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code ?? '';
}

async function readObjectsDeleted(response: Response): Promise<number> {
  const body = (await response.json()) as { objectsDeleted?: number };
  return body.objectsDeleted ?? -1;
}

describe('handlePurgeParticipantMedia - who may ask', () => {
  test('an unauthenticated caller is refused', async () => {
    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({
        resolveIdentity: async () => {
          throw new AppError('AUTH-2');
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(await readErrorCode(response)).toBe('AUTH-2');
  });

  /**
   * The role boundary is the same one Postgres enforces on the erasure itself
   * (ADR-023): staff run the record, admins end it. If this endpoint accepted
   * staff, a staff member could destroy a participant's photographs without
   * being able to erase the record that says they existed.
   */
  test.each([
    ['staff', staff],
    ['an entity contact', entity],
    ['a participant', player],
  ])('%s cannot purge media, and nothing is deleted', async (_label, identity) => {
    const bucket = buildBucket([`${ORG}/profile-photos/${PARTICIPANT}/2026/07/a.jpg`]);
    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({ resolveIdentity: async () => identity, bucket }),
    );
    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toBe('AUTH-3');
    expect(bucket.remaining()).toHaveLength(1);
  });

  test('a body without a participant id is refused before anything is listed', async () => {
    const bucket = buildBucket([`${ORG}/profile-photos/${PARTICIPANT}/2026/07/a.jpg`]);
    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: 'not-a-uuid' }),
      buildDependencies({ bucket }),
    );
    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toBe('VALIDATION-1');
    expect(bucket.listCalls()).toHaveLength(0);
    expect(bucket.remaining()).toHaveLength(1);
  });
});

describe('handlePurgeParticipantMedia - what it deletes', () => {
  test('every object she uploaded goes, across all folders', async () => {
    const bucket = buildBucket([
      `${ORG}/profile-photos/${PARTICIPANT}/2026/07/a.jpg`,
      `${ORG}/gallery/${PARTICIPANT}/2026/07/b.jpg`,
      `${ORG}/forum/${PARTICIPANT}/2025/12/c.png`,
      `${ORG}/stories/${PARTICIPANT}/2026/01/d.mp4`,
    ]);

    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({ bucket }),
    );

    expect(response.status).toBe(200);
    expect(await readObjectsDeleted(response)).toBe(4);
    expect(bucket.remaining()).toEqual([]);
  });

  /**
   * THE ASSERTION THIS FILE EXISTS FOR. A prefix built without its trailing
   * slash matches any id that merely STARTS with hers, so erasing one woman
   * would silently destroy another woman's photographs. Nothing else in the
   * system would notice: both deletions look identical in the bucket, and the
   * audit trail would record one erasure.
   */
  test('an id that merely starts with hers is untouched', async () => {
    const neighbour = `${PARTICIPANT}9`;
    const bucket = buildBucket([
      `${ORG}/gallery/${PARTICIPANT}/2026/07/hers.jpg`,
      `${ORG}/gallery/${neighbour}/2026/07/not-hers.jpg`,
    ]);

    await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({ bucket }),
    );

    expect(bucket.remaining()).toEqual([`${ORG}/gallery/${neighbour}/2026/07/not-hers.jpg`]);
  });

  /**
   * The tenant prefix comes from the CALLER's own profile, never from the
   * request, exactly as upload keys are generated (ADR-010). An admin of one
   * organization therefore cannot reach another's objects even by naming a real
   * participant id, and there is no field in the request that could say
   * otherwise.
   */
  test('an admin cannot reach another organization objects, even by naming one', async () => {
    const foreign = `${OTHER_ORG}/gallery/${PARTICIPANT}/2026/07/theirs.jpg`;
    const bucket = buildBucket([foreign]);

    const response = await handlePurgeParticipantMedia(
      // The hostile field is SENT, which is what makes this assertion able to
      // fail. Asking with a well-formed body would pass just as happily against
      // a handler that reads the tenant straight out of the request.
      buildRequest({ participantId: PARTICIPANT, orgId: OTHER_ORG }),
      buildDependencies({ bucket }),
    );

    expect(await readObjectsDeleted(response)).toBe(0);
    expect(bucket.remaining()).toEqual([foreign]);
    expect(bucket.listCalls().every((prefix) => prefix.startsWith(ORG))).toBe(true);
  });

  /**
   * R2 returns at most 1000 keys per call. A participant with more objects than
   * one page would keep everything past the first page, and the endpoint would
   * report success. Paged deliberately small here so the loop is exercised.
   */
  test('it follows the cursor rather than stopping at the first page', async () => {
    const keys = Array.from(
      { length: 7 },
      (_unused, index) => `${ORG}/gallery/${PARTICIPANT}/2026/07/photo-${index}.jpg`,
    );
    const bucket = buildBucket(keys, 2);

    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({ bucket }),
    );

    expect(await readObjectsDeleted(response)).toBe(7);
    expect(bucket.remaining()).toEqual([]);
  });

  /** Re-running must be free: the erasure is retryable only if this is. */
  test('purging twice is not an error and reports nothing left to delete', async () => {
    const bucket = buildBucket([`${ORG}/gallery/${PARTICIPANT}/2026/07/a.jpg`]);
    const dependencies = buildDependencies({ bucket });

    await handlePurgeParticipantMedia(buildRequest({ participantId: PARTICIPANT }), dependencies);
    const second = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      dependencies,
    );

    expect(second.status).toBe(200);
    expect(await readObjectsDeleted(second)).toBe(0);
  });
});

describe('handlePurgeParticipantMedia - the receipt', () => {
  /**
   * The receipt is what Postgres checks before it will erase the record. It is
   * written AFTER the objects are gone, for the same reason the whole sequence
   * runs media-first: a receipt for a sweep that did not happen would unlock an
   * erasure and leave her photographs in the bucket with nothing left to say
   * whose they were.
   */
  test('a receipt naming her and the count is recorded once the objects are gone', async () => {
    const bucket = buildBucket([
      `${ORG}/gallery/${PARTICIPANT}/2026/07/a.jpg`,
      `${ORG}/gallery/${PARTICIPANT}/2026/07/b.jpg`,
    ]);
    const receipts: { participantId: string; objectsDeleted: number; bucketWasEmpty: boolean }[] =
      [];

    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({
        bucket,
        recordReceipt: async ({ participantId, objectsDeleted }) => {
          receipts.push({
            participantId,
            objectsDeleted,
            bucketWasEmpty: bucket.remaining().length === 0,
          });
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(receipts).toEqual([
      { participantId: PARTICIPANT, objectsDeleted: 2, bucketWasEmpty: true },
    ]);
  });

  /**
   * A receipt that cannot be written must fail the whole call. Reporting success
   * here would leave the admin looking at a screen that says the media is gone,
   * with an erasure that Postgres will then refuse for a reason the screen never
   * mentioned.
   */
  test('a receipt that fails to write turns the whole purge into a failure', async () => {
    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({
        recordReceipt: async () => {
          throw new AppError('DB-1');
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await readErrorCode(response)).toBe('UPLOAD-7');
  });

  /** A bucket failure must not produce a receipt claiming the sweep happened. */
  test('a bucket that refuses the delete records no receipt', async () => {
    const receipts: string[] = [];
    const bucket = buildBucket([`${ORG}/gallery/${PARTICIPANT}/2026/07/a.jpg`]);

    const response = await handlePurgeParticipantMedia(
      buildRequest({ participantId: PARTICIPANT }),
      buildDependencies({
        bucket: {
          list: bucket.list.bind(bucket),
          delete: async () => {
            throw new Error('R2 is unavailable');
          },
        },
        recordReceipt: async ({ participantId }) => {
          receipts.push(participantId);
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await readErrorCode(response)).toBe('UPLOAD-7');
    expect(receipts).toEqual([]);
  });
});
