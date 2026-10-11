import type { Session } from '@supabase/supabase-js';
import { describe, expect, test } from 'bun:test';
import { assuranceLevelOf, needsSecondFactor } from './second-factor';

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
