import { describe, expect, test } from 'bun:test';
import { resolveMediaImageSource } from './media-source';

const objectKey =
  '11111111-2222-3333-4444-555555555555/announcements/7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e/2026/08/0123456789abcdef0123456789abcdef.jpg';

describe('resolveMediaImageSource', () => {
  test('turns a private object key into an authenticated Expo image source', () => {
    const source = resolveMediaImageSource({
      objectKeyOrUrl: objectKey,
      mediaWorkerUrl: 'https://media.example',
      accessToken: 'private-access-token',
    });

    expect(source).toEqual({
      uri: `https://media.example/objects/${objectKey}`,
      headers: { authorization: 'Bearer private-access-token' },
      cacheKey: objectKey,
    });
    expect(source?.uri).not.toContain('private-access-token');
    expect(source?.cacheKey).not.toContain('private-access-token');
  });

  test('keeps a legacy absolute URL working without sending app credentials to it', () => {
    expect(
      resolveMediaImageSource({
        objectKeyOrUrl: 'https://cdn.example/photo.jpg',
        mediaWorkerUrl: 'https://media.example',
        accessToken: 'private-access-token',
      }),
    ).toEqual({
      uri: 'https://cdn.example/photo.jpg',
      cacheKey: 'https://cdn.example/photo.jpg',
    });
  });

  test('returns no source when a private object cannot be authenticated', () => {
    expect(
      resolveMediaImageSource({
        objectKeyOrUrl: objectKey,
        mediaWorkerUrl: undefined,
        accessToken: 'private-access-token',
      }),
    ).toBeNull();
    expect(
      resolveMediaImageSource({
        objectKeyOrUrl: objectKey,
        mediaWorkerUrl: 'https://media.example',
        accessToken: undefined,
      }),
    ).toBeNull();
  });

  test('returns no source for an empty stored value', () => {
    expect(
      resolveMediaImageSource({
        objectKeyOrUrl: null,
        mediaWorkerUrl: 'https://media.example',
        accessToken: 'private-access-token',
      }),
    ).toBeNull();
  });
});
