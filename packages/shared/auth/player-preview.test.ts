import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, mock, test } from 'bun:test';
import { isAppError } from '../errors';
import type { Database } from '../types/database';
import {
  originOf,
  PLAYER_PREVIEW_HANDOFF,
  playerPreviewHandoffSchema,
  startPlayerPreview,
} from './player-preview';

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

describe('the web admin hand-off (RAPP-372)', () => {
  const credentials = { email: 'preview+x@preview.ramassa.invalid', password: 'a'.repeat(32) };

  test('takes an app path or none', () => {
    for (const target of ['/announcement/5eed0000-0000-4000-8001-000000000002', null]) {
      expect(
        playerPreviewHandoffSchema.safeParse({ type: PLAYER_PREVIEW_HANDOFF, credentials, target })
          .success,
      ).toBe(true);
    }
  });

  test('refuses another site, another message, or no password', () => {
    for (const message of [
      { type: PLAYER_PREVIEW_HANDOFF, credentials, target: '//evil.example/x' },
      { type: PLAYER_PREVIEW_HANDOFF, credentials, target: 'https://evil.example' },
      { type: 'other', credentials, target: null },
      { type: PLAYER_PREVIEW_HANDOFF, credentials: { email: credentials.email }, target: null },
    ]) {
      expect(playerPreviewHandoffSchema.safeParse(message).success).toBe(false);
    }
  });

  test('compares origins without paths', () => {
    expect(originOf('https://admin.ramassa.test/content')).toBe('https://admin.ramassa.test');
  });
});
