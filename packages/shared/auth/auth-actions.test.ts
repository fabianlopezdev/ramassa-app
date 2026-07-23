import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'bun:test';
import { isAppError } from '../errors';
import type { Database } from '../types/database';
import {
  completeAuthCallback,
  fetchProfileRole,
  requestMagicLink,
  signInWithPassword,
} from './auth-actions';

type Client = SupabaseClient<Database>;

interface AuthOverrides {
  signInWithOtp?: (args: unknown) => Promise<{ error: unknown }>;
  signInWithPassword?: (args: unknown) => Promise<{ error: unknown }>;
  setSession?: (args: unknown) => Promise<{ error: unknown }>;
}

function fakeAuthClient(overrides: AuthOverrides = {}): Client {
  return {
    auth: {
      signInWithOtp: overrides.signInWithOtp ?? (async () => ({ error: null })),
      signInWithPassword: overrides.signInWithPassword ?? (async () => ({ error: null })),
      setSession: overrides.setSession ?? (async () => ({ error: null })),
    },
  } as unknown as Client;
}

function fakeProfileClient(result: { data: unknown; error: unknown }): Client {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => result,
  };
  return { from: () => builder } as unknown as Client;
}

test('requestMagicLink sends a closed-signup OTP with the redirect', async () => {
  let received:
    { email: string; options: { shouldCreateUser: boolean; emailRedirectTo: string } } | undefined;
  const client = fakeAuthClient({
    signInWithOtp: async (args) => {
      received = args as typeof received;
      return { error: null };
    },
  });

  await requestMagicLink(client, {
    email: 'player@example.com',
    emailRedirectTo: 'ramassa://auth/callback',
  });

  expect(received?.email).toBe('player@example.com');
  expect(received?.options.shouldCreateUser).toBe(false);
  expect(received?.options.emailRedirectTo).toBe('ramassa://auth/callback');
});

test('requestMagicLink surfaces a rate limit as AUTH-5', async () => {
  const client = fakeAuthClient({
    signInWithOtp: async () => ({ error: { status: 429, message: 'Email rate limit exceeded' } }),
  });
  try {
    await requestMagicLink(client, {
      email: 'p@example.com',
      emailRedirectTo: 'ramassa://auth/callback',
    });
    throw new Error('expected requestMagicLink to throw');
  } catch (error) {
    expect(isAppError(error) && error.code).toBe('AUTH-5');
  }
});

test('signInWithPassword maps a generic failure to invalid credentials (AUTH-6)', async () => {
  const client = fakeAuthClient({
    signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }),
  });
  try {
    await signInWithPassword(client, { email: 'p@example.com', password: 'wrong-password' });
    throw new Error('expected signInWithPassword to throw');
  } catch (error) {
    expect(isAppError(error) && error.code).toBe('AUTH-6');
  }
});

test('completeAuthCallback rejects a foreign origin before calling setSession', async () => {
  let setSessionCalled = false;
  const client = fakeAuthClient({
    setSession: async () => {
      setSessionCalled = true;
      return { error: null };
    },
  });
  try {
    await completeAuthCallback(client, 'https://evil.example.com/#access_token=a&refresh_token=b', {
      allowedRedirectPrefixes: ['ramassa://auth/callback'],
    });
    throw new Error('expected completeAuthCallback to throw');
  } catch (error) {
    expect(isAppError(error) && error.code).toBe('AUTH-7');
  }
  expect(setSessionCalled).toBe(false);
});

test('completeAuthCallback opens a session from a trusted link', async () => {
  let received: { access_token: string; refresh_token: string } | undefined;
  const client = fakeAuthClient({
    setSession: async (args) => {
      received = args as typeof received;
      return { error: null };
    },
  });
  await completeAuthCallback(client, 'ramassa://auth/callback#access_token=at&refresh_token=rt', {
    allowedRedirectPrefixes: ['ramassa://auth/callback'],
  });
  expect(received).toEqual({ access_token: 'at', refresh_token: 'rt' });
});

test('fetchProfileRole returns the validated role', async () => {
  const role = await fetchProfileRole(
    fakeProfileClient({ data: { role: 'staff' }, error: null }),
    'user-1',
  );
  expect(role).toBe('staff');
});

test('fetchProfileRole rejects an unknown role value', async () => {
  try {
    await fetchProfileRole(fakeProfileClient({ data: { role: 'wizard' }, error: null }), 'user-1');
    throw new Error('expected fetchProfileRole to throw');
  } catch (error) {
    expect(isAppError(error)).toBe(true);
  }
});
