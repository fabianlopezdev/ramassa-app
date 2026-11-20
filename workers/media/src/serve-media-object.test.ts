import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { handleServeMediaObject, type ServeMediaObjectDependencies } from './serve-media-object';
import type { CallerIdentity } from './supabase-identity';

const identity: CallerIdentity = {
  userId: '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e',
  orgId: '11111111-2222-3333-4444-555555555555',
  role: 'player',
  permissions: new Set(),
  secondFactorVerifiedAt: null,
};
const objectKey = `${identity.orgId}/announcements/${identity.userId}/2026/08/0123456789abcdef0123456789abcdef.jpg`;
const galleryObjectKey = `${identity.orgId}/gallery/${identity.userId}/2026/08/1123456789abcdef0123456789abcdef.jpg`;
const feedbackObjectKey = `${identity.orgId}/feedback/${identity.userId}/2026/08/2123456789abcdef0123456789abcdef.jpg`;
const answerObjectKey = `${identity.orgId}/intake-answers/${identity.userId}/2026/10/4123456789abcdef0123456789abcdef.pdf`;
const staffPhotoObjectKey = `${identity.orgId}/profile-photos/0d6b3c4a-1e2f-4a5b-8c7d-9e0f1a2b3c4d/2026/10/5123456789abcdef0123456789abcdef.jpg`;
const documentObjectKey = `${identity.orgId}/documents/${identity.userId}/2026/08/3123456789abcdef0123456789abcdef.pdf`;

function requestFor(
  key: string = objectKey,
  method = 'GET',
  extraHeaders: Record<string, string> = {},
): Request {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return new Request(`https://media.example/objects/${encodedKey}`, {
    method,
    headers: { Authorization: 'Bearer access-token', ...extraHeaders },
  });
}

type Bucket = ServeMediaObjectDependencies['bucket'];
type StoredObject = { bytes: string; httpEtag: string; contentType: string };
type RangedRead = { key: string; range: { offset: number; length: number } | undefined };

/** A bucket that holds whole objects and answers a ranged read with that slice only. */
function bucketHolding(
  objects: Record<string, StoredObject>,
  reads: { heads: string[]; gets: RangedRead[] } = { heads: [], gets: [] },
): Bucket {
  return {
    head: async (key) => {
      reads.heads.push(key);
      const stored = objects[key];
      return stored === undefined ? null : { size: stored.bytes.length, httpEtag: stored.httpEtag };
    },
    get: async (key, options) => {
      reads.gets.push({ key, range: options?.range });
      const stored = objects[key];
      if (stored === undefined) return null;
      const range = options?.range;
      const slice =
        range === undefined
          ? stored.bytes
          : stored.bytes.slice(range.offset, range.offset + range.length);
      return {
        body: new Blob([slice]).stream(),
        size: stored.bytes.length,
        httpEtag: stored.httpEtag,
        writeHttpMetadata(headers) {
          headers.set('content-type', stored.contentType);
        },
      };
    },
  };
}

/** An empty bucket that counts every read, with or without a body. */
function countingEmptyBucket(onRead: () => void): Bucket {
  const read = async () => {
    onRead();
    return null;
  };
  return { head: read, get: read };
}

function dependencies(
  overrides: Partial<ServeMediaObjectDependencies> = {},
): ServeMediaObjectDependencies {
  return {
    resolveIdentity: async () => identity,
    authorizeGalleryObject: async () => true,
    authorizeFeedbackObject: async () => true,
    authorizeInternalDocumentObject: async () => true,
    authorizeStockObject: async () => true,
    authorizeCustomAnswerObject: async () => true,
    authorizeProfilePhotoObject: async () => true,
    bucket: bucketHolding({
      [objectKey]: {
        bytes: 'private image bytes',
        httpEtag: '"private-etag"',
        contentType: 'image/jpeg',
      },
    }),
    corsHeaders: { 'Access-Control-Allow-Origin': 'https://app.example' },
    ...overrides,
  };
}

describe('handleServeMediaObject', () => {
  test('authenticates, streams an object in the caller organization, and preserves metadata', async () => {
    const response = await handleServeMediaObject(requestFor(), dependencies());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('private image bytes');
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('content-length')).toBe('19');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBeNull();
    expect(response.headers.get('etag')).toBe('"private-etag"');
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  test('an expired or missing session returns the standard authentication error', async () => {
    const response = await handleServeMediaObject(
      requestFor(),
      dependencies({
        resolveIdentity: async () => {
          throw new AppError('AUTH-2');
        },
      }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toEqual({ error: { code: 'AUTH-2' } });
  });

  test('cross-organization, malformed, and missing keys are indistinguishable', async () => {
    const cases = [
      `22222222-3333-4444-5555-666666666666/announcements/${identity.userId}/2026/08/0123456789abcdef0123456789abcdef.jpg`,
      `${identity.orgId}/../another-org/photo.jpg`,
      `${identity.orgId}/announcements/${identity.userId}/2026/08/ffffffffffffffffffffffffffffffff.jpg`,
    ];

    const responses = await Promise.all(
      cases.map((key) => handleServeMediaObject(requestFor(key), dependencies())),
    );

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  });

  test('checks gallery row visibility before reading the private R2 object', async () => {
    let storageReads = 0;
    const response = await handleServeMediaObject(
      requestFor(galleryObjectKey),
      dependencies({
        authorizeGalleryObject: async () => false,
        bucket: countingEmptyBucket(() => {
          storageReads += 1;
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(storageReads).toBe(0);
  });

  test('checks feedback row visibility before reading the private R2 object', async () => {
    let storageReads = 0;
    const response = await handleServeMediaObject(
      requestFor(feedbackObjectKey),
      dependencies({
        authorizeFeedbackObject: async () => false,
        bucket: countingEmptyBucket(() => {
          storageReads += 1;
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(storageReads).toBe(0);
  });

  test('checks that an answer file is hers or readable at its privacy level first (RAPP-610)', async () => {
    let storageReads = 0;
    const checked: string[] = [];
    const response = await handleServeMediaObject(
      requestFor(answerObjectKey),
      dependencies({
        authorizeCustomAnswerObject: async (key) => {
          checked.push(key);
          return false;
        },
        bucket: countingEmptyBucket(() => {
          storageReads += 1;
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(checked).toEqual([answerObjectKey]);
    expect(storageReads).toBe(0);
  });

  test('checks staff-only document visibility before reading the private R2 object', async () => {
    let storageReads = 0;
    const response = await handleServeMediaObject(
      requestFor(documentObjectKey),
      dependencies({
        authorizeInternalDocumentObject: async () => false,
        bucket: countingEmptyBucket(() => {
          storageReads += 1;
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(storageReads).toBe(0);
  });

  test('checks that an arrival photo belongs to an arrival she may read (RAPP-250)', async () => {
    let storageReads = 0;
    const response = await handleServeMediaObject(
      requestFor(documentObjectKey.replace('/documents/', '/stock/').replace(/\.pdf$/, '.jpg')),
      dependencies({
        authorizeStockObject: async () => false,
        bucket: countingEmptyBucket(() => {
          storageReads += 1;
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(storageReads).toBe(0);
  });

  test('asks the database before serving a profile photo (RAPP-639)', async () => {
    const asked: string[] = [];
    let storageReads = 0;
    const refused = await handleServeMediaObject(
      requestFor(staffPhotoObjectKey),
      dependencies({
        authorizeProfilePhotoObject: async (key) => {
          asked.push(key);
          return false;
        },
        bucket: countingEmptyBucket(() => {
          storageReads += 1;
        }),
      }),
    );

    expect(refused.status).toBe(404);
    expect(asked).toEqual([staffPhotoObjectKey]);
    expect(storageReads).toBe(0);
  });

  test("serves a team member's current photo the database allows (RAPP-639)", async () => {
    const response = await handleServeMediaObject(
      requestFor(staffPhotoObjectKey),
      dependencies({
        authorizeProfilePhotoObject: async (key) => key === staffPhotoObjectKey,
        bucket: {
          head: async () => null,
          get: async (key) =>
            key === staffPhotoObjectKey
              ? {
                  body: new Blob(['staff photo']).stream(),
                  size: 11,
                  httpEtag: '"staff-etag"',
                  writeHttpMetadata(headers) {
                    headers.set('content-type', 'image/jpeg');
                  },
                }
              : null,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('staff photo');
  });

  test('a failed profile photo check is a database error and reads nothing', async () => {
    let storageReads = 0;
    const response = await handleServeMediaObject(
      requestFor(staffPhotoObjectKey),
      dependencies({
        authorizeProfilePhotoObject: async () => {
          throw new Error('network down');
        },
        bucket: countingEmptyBucket(() => {
          storageReads += 1;
        }),
      }),
    );

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(storageReads).toBe(0);
  });

  test('reports a storage failure without exposing its details', async () => {
    const reported: Array<Record<string, unknown>> = [];
    const response = await handleServeMediaObject(
      requestFor(),
      dependencies({
        bucket: {
          head: async () => null,
          get: async () => {
            throw new Error('account and bucket details');
          },
        },
        onError: (_error, context) => reported.push(context),
      }),
    );

    expect(response.status).toBe(500);
    expect((await response.json()) as unknown).toEqual({ error: { code: 'UPLOAD-6' } });
    expect(reported).toEqual([{ stage: 'get-object' }]);
  });

  test('refuses methods other than GET before reading identity or storage', async () => {
    let identityReads = 0;
    const response = await handleServeMediaObject(
      requestFor(objectKey, 'POST'),
      dependencies({
        resolveIdentity: async () => {
          identityReads += 1;
          return identity;
        },
      }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(identityReads).toBe(0);
  });
});

/**
 * Byte ranges (RAPP-895). The iOS player reads a video in ranges and refuses a
 * source that answers a ranged request with the whole file.
 */
describe('handleServeMediaObject byte ranges', () => {
  const videoObjectKey = `${identity.orgId}/gallery/${identity.userId}/2026/11/6123456789abcdef0123456789abcdef.mp4`;
  const videoBytes = '0123456789abcdefghi';
  const video: StoredObject = {
    bytes: videoBytes,
    httpEtag: '"video-etag"',
    contentType: 'video/mp4',
  };

  function ranged(range: string, extraHeaders: Record<string, string> = {}) {
    const reads = { heads: [] as string[], gets: [] as RangedRead[] };
    const response = handleServeMediaObject(
      requestFor(videoObjectKey, 'GET', { Range: range, ...extraHeaders }),
      dependencies({ bucket: bucketHolding({ [videoObjectKey]: video }, reads) }),
    );
    return { response, reads };
  }

  test('a first-bytes range gets 206 with only those bytes', async () => {
    const { response: pending, reads } = ranged('bytes=0-1');
    const response = await pending;

    expect(response.status).toBe(206);
    expect(await response.text()).toBe('01');
    expect(response.headers.get('content-range')).toBe('bytes 0-1/19');
    expect(response.headers.get('content-length')).toBe('2');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('etag')).toBe('"video-etag"');
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(reads.gets).toEqual([{ key: videoObjectKey, range: { offset: 0, length: 2 } }]);
  });

  test('an open-ended range runs to the last byte', async () => {
    const response = await ranged('bytes=10-').response;

    expect(response.status).toBe(206);
    expect(await response.text()).toBe('abcdefghi');
    expect(response.headers.get('content-range')).toBe('bytes 10-18/19');
    expect(response.headers.get('content-length')).toBe('9');
  });

  test('a suffix range returns the last bytes', async () => {
    const response = await ranged('bytes=-4').response;

    expect(response.status).toBe(206);
    expect(await response.text()).toBe('fghi');
    expect(response.headers.get('content-range')).toBe('bytes 15-18/19');
  });

  test('a suffix longer than the object returns the whole object as a range', async () => {
    const response = await ranged('bytes=-500').response;

    expect(response.status).toBe(206);
    expect(await response.text()).toBe(videoBytes);
    expect(response.headers.get('content-range')).toBe('bytes 0-18/19');
  });

  test('an end past the last byte is cut at the last byte', async () => {
    const response = await ranged('bytes=16-999').response;

    expect(response.status).toBe(206);
    expect(await response.text()).toBe('ghi');
    expect(response.headers.get('content-range')).toBe('bytes 16-18/19');
    expect(response.headers.get('content-length')).toBe('3');
  });

  test('a range that starts past the end gets 416 with the size and reads no body', async () => {
    for (const unsatisfiable of ['bytes=19-', 'bytes=40-50', 'bytes=-0']) {
      const { response: pending, reads } = ranged(unsatisfiable);
      const response = await pending;

      expect(response.status).toBe(416);
      expect(await response.text()).toBe('');
      expect(response.headers.get('content-range')).toBe('bytes */19');
      expect(response.headers.get('accept-ranges')).toBe('bytes');
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
      expect(reads.gets).toEqual([]);
    }
  });

  test('a range header this endpoint does not serve is ignored and the whole object is sent', async () => {
    for (const ignored of ['bytes=0-1,4-5', 'items=0-1', 'bytes=5-2', 'bytes=', 'bytes=a-b']) {
      const { response: pending, reads } = ranged(ignored);
      const response = await pending;

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(videoBytes);
      expect(response.headers.get('content-range')).toBeNull();
      expect(response.headers.get('content-length')).toBe('19');
      expect(reads.gets).toEqual([{ key: videoObjectKey, range: undefined }]);
    }
  });

  test('If-Range with the current ETag keeps the range, any other value sends the whole object', async () => {
    const current = await ranged('bytes=0-1', { 'If-Range': '"video-etag"' }).response;
    expect(current.status).toBe(206);
    expect(await current.text()).toBe('01');

    const stale = await ranged('bytes=0-1', { 'If-Range': '"older-etag"' }).response;
    expect(stale.status).toBe(200);
    expect(await stale.text()).toBe(videoBytes);
  });

  test('a ranged request for an absent object is 404', async () => {
    const response = await handleServeMediaObject(
      requestFor(videoObjectKey, 'GET', { Range: 'bytes=0-1' }),
      dependencies({ bucket: bucketHolding({}) }),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  test('a ranged request passes the same checks before any storage read', async () => {
    let storageReads = 0;
    const bucket = countingEmptyBucket(() => {
      storageReads += 1;
    });
    const otherOrganizationKey = `22222222-3333-4444-5555-666666666666/gallery/${identity.userId}/2026/11/6123456789abcdef0123456789abcdef.mp4`;

    const crossOrganization = await handleServeMediaObject(
      requestFor(otherOrganizationKey, 'GET', { Range: 'bytes=0-1' }),
      dependencies({ bucket }),
    );
    const hiddenGalleryRow = await handleServeMediaObject(
      requestFor(videoObjectKey, 'GET', { Range: 'bytes=0-1' }),
      dependencies({ authorizeGalleryObject: async () => false, bucket }),
    );
    const signedOut = await handleServeMediaObject(
      requestFor(videoObjectKey, 'GET', { Range: 'bytes=0-1' }),
      dependencies({
        resolveIdentity: async () => {
          throw new AppError('AUTH-2');
        },
        bucket,
      }),
    );

    expect(crossOrganization.status).toBe(404);
    expect(hiddenGalleryRow.status).toBe(404);
    expect(signedOut.status).toBe(401);
    expect(storageReads).toBe(0);
  });

  test('reports a failed size read without exposing its details', async () => {
    const reported: Array<Record<string, unknown>> = [];
    const response = await handleServeMediaObject(
      requestFor(videoObjectKey, 'GET', { Range: 'bytes=0-1' }),
      dependencies({
        bucket: {
          head: async () => {
            throw new Error('account and bucket details');
          },
          get: async () => null,
        },
        onError: (_error, context) => reported.push(context),
      }),
    );

    expect(response.status).toBe(500);
    expect((await response.json()) as unknown).toEqual({ error: { code: 'UPLOAD-6' } });
    expect(reported).toEqual([{ stage: 'head-object' }]);
  });
});
