import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { handleServeMediaObject, type ServeMediaObjectDependencies } from './serve-media-object';
import type { CallerIdentity } from './supabase-identity';

const identity: CallerIdentity = {
  userId: '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e',
  orgId: '11111111-2222-3333-4444-555555555555',
  role: 'player',
};
const objectKey = `${identity.orgId}/announcements/${identity.userId}/2026/08/0123456789abcdef0123456789abcdef.jpg`;
const galleryObjectKey = `${identity.orgId}/gallery/${identity.userId}/2026/08/1123456789abcdef0123456789abcdef.jpg`;

function requestFor(key: string = objectKey, method = 'GET'): Request {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return new Request(`https://media.example/objects/${encodedKey}`, {
    method,
    headers: { Authorization: 'Bearer access-token' },
  });
}

function dependencies(
  overrides: Partial<ServeMediaObjectDependencies> = {},
): ServeMediaObjectDependencies {
  return {
    resolveIdentity: async () => identity,
    authorizeGalleryObject: async () => true,
    bucket: {
      get: async (key) =>
        key === objectKey
          ? {
              body: new Blob(['private image bytes']).stream(),
              size: 19,
              httpEtag: '"private-etag"',
              writeHttpMetadata(headers) {
                headers.set('content-type', 'image/jpeg');
              },
            }
          : null,
    },
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
        bucket: {
          get: async () => {
            storageReads += 1;
            return null;
          },
        },
      }),
    );

    expect(response.status).toBe(404);
    expect(storageReads).toBe(0);
  });

  test('reports a storage failure without exposing its details', async () => {
    const reported: Array<Record<string, unknown>> = [];
    const response = await handleServeMediaObject(
      requestFor(),
      dependencies({
        bucket: {
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
