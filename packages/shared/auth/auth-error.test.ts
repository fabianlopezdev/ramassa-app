import { expect, test } from 'bun:test';
import { mapSupabaseAuthError } from './auth-error';

test('a 429 status maps to the rate-limit code', () => {
  expect(mapSupabaseAuthError({ status: 429, message: 'Email rate limit exceeded' })).toBe(
    'AUTH-5',
  );
});

test('rate-limit wording maps to AUTH-5 even without a 429 status', () => {
  expect(mapSupabaseAuthError({ code: 'over_email_send_rate_limit' })).toBe('AUTH-5');
});

test('an expired one-time link maps to AUTH-4', () => {
  expect(mapSupabaseAuthError({ code: 'otp_expired', message: 'Token has expired' })).toBe(
    'AUTH-4',
  );
});

test('invalid credentials map to AUTH-6', () => {
  expect(
    mapSupabaseAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
  ).toBe('AUTH-6');
});

test('the fallback is used when nothing specific matches', () => {
  expect(mapSupabaseAuthError({ message: 'boom' })).toBe('AUTH-1');
  expect(mapSupabaseAuthError({ message: 'boom' }, 'AUTH-6')).toBe('AUTH-6');
  expect(mapSupabaseAuthError(null)).toBe('AUTH-1');
});
