import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, mock, test } from 'bun:test';
import { isAppError } from '../errors';
import type { Database } from '../types/database';
import { startPlayerPreview } from './player-preview';

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = mock(async () => result);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe('startPlayerPreview', () => {
  test('returns the preview account address and password', async () => {
    const { client, rpc } = clientReturning({
      data: {
        email: 'preview+5eed0000-0000-4000-8000-000000000000@preview.ramassa.invalid',
        password: 'a'.repeat(32),
      },
      error: null,
    });
    expect(await startPlayerPreview(client)).toEqual({
      email: 'preview+5eed0000-0000-4000-8000-000000000000@preview.ramassa.invalid',
      password: 'a'.repeat(32),
    });
    expect(rpc).toHaveBeenCalledWith('start_player_preview');
  });

  test('a refusal is AUTH-3', async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: 'only a team member', code: '42501' },
    });
    const thrown = await startPlayerPreview(client).catch((error: unknown) => error);
    expect(isAppError(thrown) && thrown.code).toBe('AUTH-3');
  });

  test('an answer without a password is refused', async () => {
    const { client } = clientReturning({ data: { email: 'x@y.z' }, error: null });
    expect(startPlayerPreview(client)).rejects.toThrow();
  });
});
