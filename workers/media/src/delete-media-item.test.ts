import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { handleDeleteMediaItem, type DeleteMediaItemDependencies } from './delete-media-item';
import type { CallerIdentity } from './supabase-identity';

const orgId = '11111111-2222-3333-4444-555555555555';
const userId = '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e';
const mediaItemId = '0b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e';
const fileObjectKey = `${orgId}/gallery/${userId}/2026/08/video.mp4`;
const thumbnailObjectKey = `${orgId}/gallery/${userId}/2026/08/video-thumb.jpg`;

const identity: CallerIdentity = { userId, orgId, role: 'player' };

function request(method = 'DELETE') {
  return new Request(`https://media.example/gallery/items/${mediaItemId}`, {
    method,
    headers: { Authorization: 'Bearer token' },
  });
}

function dependencies(
  overrides: Partial<DeleteMediaItemDependencies> = {},
): DeleteMediaItemDependencies {
  return {
    resolveIdentity: async () => identity,
    prepareDeletion: async () => ({ fileObjectKey, thumbnailObjectKey }),
    deleteObjects: async () => undefined,
    completeDeletion: async () => true,
    ...overrides,
  };
}

async function errorCode(response: Response) {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

describe('single media deletion', () => {
  test('deletes both R2 objects before completing the row deletion', async () => {
    const calls: unknown[] = [];
    const response = await handleDeleteMediaItem(
      request(),
      mediaItemId,
      dependencies({
        prepareDeletion: async (input) => {
          calls.push(['prepare', input]);
          return { fileObjectKey, thumbnailObjectKey };
        },
        deleteObjects: async (keys) => {
          calls.push(['r2', keys]);
        },
        completeDeletion: async (input) => {
          calls.push(['row', input]);
          return true;
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(calls.map((call) => (call as unknown[])[0])).toEqual(['prepare', 'r2', 'row']);
    expect(calls[1]).toEqual(['r2', [fileObjectKey, thumbnailObjectKey]]);
  });

  test('does not delete R2 when the database denies another account', async () => {
    let deleted = false;
    const response = await handleDeleteMediaItem(
      request(),
      mediaItemId,
      dependencies({
        prepareDeletion: async () => {
          throw new AppError('AUTH-3');
        },
        deleteObjects: async () => {
          deleted = true;
        },
      }),
    );
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('AUTH-3');
    expect(deleted).toBe(false);
  });

  test('never deletes the row when R2 deletion fails', async () => {
    let completed = false;
    const response = await handleDeleteMediaItem(
      request(),
      mediaItemId,
      dependencies({
        deleteObjects: async () => {
          throw new Error('R2 unavailable');
        },
        completeDeletion: async () => {
          completed = true;
          return true;
        },
      }),
    );
    expect(response.status).toBe(500);
    expect(await errorCode(response)).toBe('UPLOAD-7');
    expect(completed).toBe(false);
  });

  test('rejects keys outside the authenticated tenant gallery prefix', async () => {
    let deleted = false;
    const response = await handleDeleteMediaItem(
      request(),
      mediaItemId,
      dependencies({
        prepareDeletion: async () => ({
          fileObjectKey: `99999999-8888-7777-6666-555555555555/gallery/${userId}/bad.mp4`,
          thumbnailObjectKey: null,
        }),
        deleteObjects: async () => {
          deleted = true;
        },
      }),
    );
    expect(response.status).toBe(403);
    expect(deleted).toBe(false);
  });
});
