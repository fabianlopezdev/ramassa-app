import type { Session } from '@supabase/supabase-js';
import { describe, expect, test } from 'bun:test';
import {
  assuranceLevelOf,
  fetchSecondFactorWaived,
  mayHaveSecondFactorWaived,
  needsSecondFactor,
} from './second-factor';

function sessionWith(claims: Record<string, unknown>): Session {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { access_token: `${encode({ alg: 'none' })}.${encode(claims)}.signature` } as Session;
}

describe('assuranceLevelOf', () => {
  test('reads the level the access token carries', () => {
    expect(assuranceLevelOf(sessionWith({ aal: 'aal2' }))).toBe('aal2');
    expect(assuranceLevelOf(sessionWith({ aal: 'aal1' }))).toBe('aal1');
    expect(assuranceLevelOf(sessionWith({}))).toBe('aal1');
  });

  test('no session, or a token it cannot read, has no level', () => {
    expect(assuranceLevelOf(null)).toBeNull();
    expect(assuranceLevelOf({ access_token: 'not-a-token' } as Session)).toBeNull();
  });
});

describe('needsSecondFactor', () => {
  test('team members and entity contacts need it until the token is aal2', () => {
    for (const role of ['staff', 'admin', 'entity'] as const) {
      expect(needsSecondFactor(role, sessionWith({ aal: 'aal1' }))).toBe(true);
      expect(needsSecondFactor(role, sessionWith({ aal: 'aal2' }))).toBe(false);
    }
  });

  test('players never need it, and an unknown role waits for its lookup', () => {
    expect(needsSecondFactor('player', sessionWith({ aal: 'aal1' }))).toBe(false);
    expect(needsSecondFactor(null, sessionWith({ aal: 'aal1' }))).toBe(false);
  });
});

describe('a waived second factor (RAPP-628)', () => {
  test('a waived session needs no second factor, whatever the role', () => {
    for (const role of ['staff', 'admin', 'entity'] as const) {
      expect(needsSecondFactor(role, sessionWith({ aal: 'aal1' }), true)).toBe(false);
      expect(needsSecondFactor(role, sessionWith({ aal: 'aal1' }), false)).toBe(true);
    }
  });

  test('only the roles behind the second factor ask about the waiver', () => {
    expect(mayHaveSecondFactorWaived('staff', sessionWith({ aal: 'aal1' }))).toBe(true);
    expect(mayHaveSecondFactorWaived('admin', sessionWith({ aal: 'aal1' }))).toBe(true);
    expect(mayHaveSecondFactorWaived('entity', sessionWith({ aal: 'aal1' }))).toBe(true);
    expect(mayHaveSecondFactorWaived('player', sessionWith({ aal: 'aal1' }))).toBe(false);
    expect(mayHaveSecondFactorWaived(null, sessionWith({ aal: 'aal1' }))).toBe(false);
    expect(mayHaveSecondFactorWaived('staff', sessionWith({ aal: 'aal2' }))).toBe(false);
  });

  function clientAnswering(answer: { data: unknown; error: { message: string } | null }) {
    const calls: string[] = [];
    const client = {
      rpc: async (name: string) => {
        calls.push(name);
        return answer;
      },
    } as unknown as Parameters<typeof fetchSecondFactorWaived>[0];
    return { client, calls };
  }

  test('asks the database for the signed-in account', async () => {
    const waived = clientAnswering({ data: true, error: null });
    expect(await fetchSecondFactorWaived(waived.client)).toBe(true);
    expect(waived.calls).toEqual(['my_second_factor_waived']);
    expect(
      await fetchSecondFactorWaived(clientAnswering({ data: false, error: null }).client),
    ).toBe(false);
  });

  test('a refusal or an unexpected answer is a typed error, never a waiver', async () => {
    const refused = clientAnswering({ data: null, error: { message: 'network' } });
    await expect(fetchSecondFactorWaived(refused.client)).rejects.toMatchObject({ code: 'AUTH-1' });
    const odd = clientAnswering({ data: 'yes', error: null });
    await expect(fetchSecondFactorWaived(odd.client)).rejects.toMatchObject({ code: 'AUTH-1' });
  });
});
