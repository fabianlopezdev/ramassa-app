import type { Session } from '@supabase/supabase-js';
import { describe, expect, test } from 'bun:test';
import { databaseErrorCode } from '../errors';
import { hasRecentSecondFactor, secondFactorVerifiedAt } from './step-up';

function sessionWith(claims: Record<string, unknown>): Session {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { access_token: `${encode({ alg: 'none' })}.${encode(claims)}.signature` } as Session;
}

const NOW_MS = Date.UTC(2026, 9, 11, 12, 0, 0);
const secondsAgo = (seconds: number) => NOW_MS / 1000 - seconds;

describe('secondFactorVerifiedAt', () => {
  test('reads the most recent authenticator verification from the token', () => {
    const session = sessionWith({
      amr: [
        { method: 'totp', timestamp: secondsAgo(3600) },
        { method: 'password', timestamp: secondsAgo(10) },
        { method: 'totp', timestamp: secondsAgo(120) },
      ],
    });
    expect(secondFactorVerifiedAt(session)).toBe(secondsAgo(120));
  });

  test('a session without one, or without a readable token, has none', () => {
    expect(
      secondFactorVerifiedAt(sessionWith({ amr: [{ method: 'otp', timestamp: 1 }] })),
    ).toBeNull();
    expect(secondFactorVerifiedAt(sessionWith({}))).toBeNull();
    expect(secondFactorVerifiedAt(null)).toBeNull();
  });
});

describe('hasRecentSecondFactor', () => {
  const at = (seconds: number) =>
    sessionWith({ amr: [{ method: 'totp', timestamp: secondsAgo(seconds) }] });

  test('a code from the last few minutes is recent', () => {
    expect(hasRecentSecondFactor(at(60), NOW_MS)).toBe(true);
  });

  test('the screens ask again a minute before the database would refuse', () => {
    expect(hasRecentSecondFactor(at(8 * 60), NOW_MS)).toBe(true);
    expect(hasRecentSecondFactor(at(9 * 60), NOW_MS)).toBe(false);
    expect(hasRecentSecondFactor(at(11 * 60), NOW_MS)).toBe(false);
  });

  test('no code is never recent', () => {
    expect(hasRecentSecondFactor(sessionWith({ aal: 'aal2' }), NOW_MS)).toBe(false);
  });
});

describe('databaseErrorCode', () => {
  test('the database asking for a code is AUTH-9, anything else DB-1', () => {
    expect(databaseErrorCode('step_up_required')).toBe('AUTH-9');
    expect(databaseErrorCode('permission denied')).toBe('DB-1');
  });
});
