import { expect, test } from 'bun:test';
import {
  EnvironmentValidationError,
  isTestSignInBuild,
  parseClientEnv,
  parseServerEnv,
} from './env';

const validClient = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
};

const validServer = {
  ...validClient,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
};

test('parseClientEnv returns typed public config on valid input', () => {
  const env = parseClientEnv(validClient);
  expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe('https://project.supabase.co');
  expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key-value');
});

test('parseClientEnv fails fast with a named error listing the missing key', () => {
  try {
    parseClientEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' });
    throw new Error('expected parseClientEnv to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(EnvironmentValidationError);
    const validationError = error as EnvironmentValidationError;
    expect(validationError.name).toBe('EnvironmentValidationError');
    expect(validationError.missingOrInvalidKeys).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(validationError.message).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }
});

test('the named error lists every missing key at once', () => {
  try {
    parseClientEnv({});
    throw new Error('expected parseClientEnv to throw');
  } catch (error) {
    const keys = (error as EnvironmentValidationError).missingOrInvalidKeys;
    expect(keys).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(keys).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }
});

test('a malformed URL is rejected and named', () => {
  try {
    parseClientEnv({ ...validClient, EXPO_PUBLIC_SUPABASE_URL: 'not-a-url' });
    throw new Error('expected parseClientEnv to throw');
  } catch (error) {
    expect((error as EnvironmentValidationError).missingOrInvalidKeys).toContain(
      'EXPO_PUBLIC_SUPABASE_URL',
    );
  }
});

test('parseServerEnv requires the server-only service role key', () => {
  expect(() => parseServerEnv(validClient)).toThrow(EnvironmentValidationError);
  const env = parseServerEnv(validServer);
  expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key-value');
});

test('the client schema never surfaces the server-only service key (schema separation)', () => {
  const env = parseClientEnv(validServer);
  expect('SUPABASE_SERVICE_ROLE_KEY' in env).toBe(false);
});

test('the staging test sign-in flag is optional, and only the word true turns it on (RAPP-616)', () => {
  expect(isTestSignInBuild(parseClientEnv(validClient))).toBe(false);
  expect(
    isTestSignInBuild(parseClientEnv({ ...validClient, EXPO_PUBLIC_TEST_SIGN_IN: 'true' })),
  ).toBe(true);
  expect(
    isTestSignInBuild(parseClientEnv({ ...validClient, EXPO_PUBLIC_TEST_SIGN_IN: 'false' })),
  ).toBe(false);
  expect(() => parseClientEnv({ ...validClient, EXPO_PUBLIC_TEST_SIGN_IN: 'yes' })).toThrow(
    EnvironmentValidationError,
  );
  // An unset build variable can arrive as an empty string: still off.
  expect(isTestSignInBuild(parseClientEnv({ ...validClient, EXPO_PUBLIC_TEST_SIGN_IN: '' }))).toBe(
    false,
  );
});
