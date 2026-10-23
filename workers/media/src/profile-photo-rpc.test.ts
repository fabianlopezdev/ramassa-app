import { describe, expect, test } from 'bun:test';
import { canReadProfilePhotoObject } from './media-item-deletion-rpc';

const objectKey =
  '11111111-2222-3333-4444-555555555555/profile-photos/0d6b3c4a-1e2f-4a5b-8c7d-9e0f1a2b3c4d/2026/10/5123456789abcdef0123456789abcdef.jpg';

function fetchReturning(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const implementation = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, implementation };
}

describe('canReadProfilePhotoObject (RAPP-639)', () => {
  test('asks can_read_profile_photo_object with her own token', async () => {
    const { calls, implementation } = fetchReturning(true);
    const allowed = await canReadProfilePhotoObject({
      objectKey,
      token: 'player-token',
      supabaseUrl: 'https://db.example',
      supabasePublishableKey: 'publishable',
      fetchImplementation: implementation,
    });

    expect(allowed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://db.example/rest/v1/rpc/can_read_profile_photo_object');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ p_object_key: objectKey });
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer player-token');
  });

  test('anything but true is a refusal', async () => {
    for (const body of [false, null, 'true', 1]) {
      const { implementation } = fetchReturning(body);
      expect(
        await canReadProfilePhotoObject({
          objectKey,
          token: 'player-token',
          supabaseUrl: 'https://db.example',
          supabasePublishableKey: 'publishable',
          fetchImplementation: implementation,
        }),
      ).toBe(false);
    }
  });

  test('a failed call throws, so the worker answers with a database error', async () => {
    const { implementation } = fetchReturning({ message: 'boom' }, 500);
    await expect(
      canReadProfilePhotoObject({
        objectKey,
        token: 'player-token',
        supabaseUrl: 'https://db.example',
        supabasePublishableKey: 'publishable',
        fetchImplementation: implementation,
      }),
    ).rejects.toMatchObject({ code: 'DB-1' });
  });
});
