import { describe, expect, test } from 'bun:test';
import { isDeletableTestPlayer } from './test-player-check';

const PARTICIPANT = '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e';

describe('asking Postgres whether a person is a deletable test player (RAPP-617)', () => {
  test('asks the RPC with the caller own token, and believes only a true', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const answer = async (body: unknown) =>
      isDeletableTestPlayer({
        participantId: PARTICIPANT,
        token: 'caller-token',
        supabaseUrl: 'http://127.0.0.1:54321',
        supabasePublishableKey: 'publishable',
        fetchImplementation: (async (url: string, init: RequestInit) => {
          seen.push({ url, init });
          return new Response(JSON.stringify(body), { status: 200 });
        }) as unknown as typeof fetch,
      });
    expect(await answer(true)).toBe(true);
    expect(await answer(false)).toBe(false);
    expect(await answer('true')).toBe(false);
    expect(seen[0]?.url).toBe('http://127.0.0.1:54321/rest/v1/rpc/is_deletable_test_player');
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({ p_profile_id: PARTICIPANT });
    expect((seen[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer caller-token',
    );
  });

  test('a refused or failed request is a no', async () => {
    const result = await isDeletableTestPlayer({
      participantId: PARTICIPANT,
      token: 'caller-token',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'publishable',
      fetchImplementation: (async () =>
        new Response('{"message":"denied"}', { status: 403 })) as unknown as typeof fetch,
    });
    expect(result).toBe(false);
  });
});
