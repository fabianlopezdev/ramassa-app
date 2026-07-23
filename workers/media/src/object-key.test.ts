import { describe, expect, test } from 'bun:test';
import { generateObjectKey } from './object-key';

const identity = {
  userId: '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e',
  orgId: '11111111-2222-3333-4444-555555555555',
  role: 'player',
} as const;

const generatedAt = new Date('2026-07-23T09:15:00.000Z');

describe('generateObjectKey', () => {
  test('partitions by organization, folder, uploader and month', () => {
    const key = generateObjectKey({
      identity,
      folder: 'gallery',
      contentType: 'image/jpeg',
      generatedAt,
      randomFileName: 'abc123',
    });
    expect(key).toBe(`${identity.orgId}/gallery/${identity.userId}/2026/07/abc123.jpg`);
  });

  test('uses the extension of the declared content type, not a client-supplied name', () => {
    expect(
      generateObjectKey({
        identity,
        folder: 'documents',
        contentType: 'application/pdf',
        generatedAt,
        randomFileName: 'abc123',
      }),
    ).toEndWith('.pdf');
  });

  test('generates a unique file name per call when none is injected', () => {
    const makeKey = () =>
      generateObjectKey({ identity, folder: 'gallery', contentType: 'image/png', generatedAt });
    expect(makeKey()).not.toBe(makeKey());
  });

  test('produces a key with no traversal segments, whatever the inputs', () => {
    const key = generateObjectKey({
      identity,
      folder: 'forum',
      contentType: 'video/mp4',
      generatedAt,
    });
    expect(key).not.toContain('..');
    expect(key).not.toStartWith('/');
    expect(key).toMatch(/^[a-z0-9-]+\/[a-z-]+\/[a-z0-9-]+\/\d{4}\/\d{2}\/[a-z0-9]+\.[a-z0-9]+$/);
  });
});
