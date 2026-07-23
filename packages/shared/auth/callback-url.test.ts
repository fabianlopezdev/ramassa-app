import { expect, test } from 'bun:test';
import { isAppError } from '../errors';
import { parseAuthCallbackUrl } from './callback-url';

const mobilePrefixes = ['ramassa://auth/callback'];

test('extracts access and refresh tokens from the fragment of a trusted link', () => {
  const url =
    'ramassa://auth/callback#access_token=abc123&refresh_token=def456&token_type=bearer&type=magiclink';
  expect(parseAuthCallbackUrl(url, { allowedRedirectPrefixes: mobilePrefixes })).toEqual({
    accessToken: 'abc123',
    refreshToken: 'def456',
  });
});

test('also reads tokens from the query string', () => {
  const url = 'https://admin.ramassa.app/auth/callback?access_token=q1&refresh_token=q2';
  expect(
    parseAuthCallbackUrl(url, {
      allowedRedirectPrefixes: ['https://admin.ramassa.app/auth/callback'],
    }),
  ).toEqual({ accessToken: 'q1', refreshToken: 'q2' });
});

test('rejects a link from a foreign origin as untrusted (AUTH-7), before reading tokens', () => {
  const crafted = 'https://evil.example.com/auth/callback#access_token=stolen&refresh_token=stolen';
  try {
    parseAuthCallbackUrl(crafted, { allowedRedirectPrefixes: mobilePrefixes });
    throw new Error('expected parseAuthCallbackUrl to throw');
  } catch (error) {
    expect(isAppError(error) && error.code).toBe('AUTH-7');
  }
});

test('maps an expired-link error payload to AUTH-4', () => {
  const url =
    'ramassa://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  try {
    parseAuthCallbackUrl(url, { allowedRedirectPrefixes: mobilePrefixes });
    throw new Error('expected parseAuthCallbackUrl to throw');
  } catch (error) {
    expect(isAppError(error) && error.code).toBe('AUTH-4');
  }
});

test('a trusted link with no tokens is an invalid link (AUTH-4)', () => {
  try {
    parseAuthCallbackUrl('ramassa://auth/callback', { allowedRedirectPrefixes: mobilePrefixes });
    throw new Error('expected parseAuthCallbackUrl to throw');
  } catch (error) {
    expect(isAppError(error) && error.code).toBe('AUTH-4');
  }
});
