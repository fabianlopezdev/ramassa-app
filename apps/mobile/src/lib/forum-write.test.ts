import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { requireForumWriteOnline, submitForumPostWithDependencies } from './forum-write';

describe('forum online write policy', () => {
  test('fails immediately offline instead of queueing player content', () => {
    expect(() => requireForumWriteOnline(false)).toThrow(new AppError('NETWORK-1'));
  });

  test('uploads the already-compressed image before storing its R2 object key', async () => {
    const calls: unknown[] = [];
    const image = {
      uri: 'file:///compressed.jpg',
      width: 1_000,
      height: 700,
      contentType: 'image/jpeg' as const,
      byteLength: 400_000,
      data: new Uint8Array(400_000),
    };
    const result = await submitForumPostWithDependencies(
      {} as never,
      {
        isOnline: true,
        accessToken: 'local-token',
        mediaWorkerUrl: 'http://127.0.0.1:8787',
        categoryId: '5eed0000-0000-4000-8006-000000000002',
        content: 'Busco feina',
        image,
      },
      {
        upload: async (options) => {
          calls.push(['upload', options.folder, options.file.byteLength]);
          return {
            ok: true as const,
            value: {
              objectKey:
                '5eed0000-0000-4000-8000-000000000000/forum/5eed0000-0000-4000-8000-000000000011/2026/08/photo.jpg',
              expiresAt: '2026-08-12T12:00:00.000Z',
            },
          };
        },
        createPost: async (_client, input) => {
          calls.push(['create', input]);
          return '5eed0000-0000-4000-8010-000000000099';
        },
      },
    );

    expect(result).toBe('5eed0000-0000-4000-8010-000000000099');
    expect(calls).toEqual([
      ['upload', 'forum', 400_000],
      [
        'create',
        {
          categoryId: '5eed0000-0000-4000-8006-000000000002',
          content: 'Busco feina',
          imageObjectKey:
            '5eed0000-0000-4000-8000-000000000000/forum/5eed0000-0000-4000-8000-000000000011/2026/08/photo.jpg',
        },
      ],
    ]);
  });
});
