import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'bun:test';
import { isAppError } from '../errors';
import type { Database } from '../types/database';
import {
  fetchProfileRole,
  fetchProfileSummary,
  requestEmailOtp,
  signInWithAccessCode,
  signInWithPassword,
  verifyEmailOtp,
} from './auth-actions';

type Client = SupabaseClient<Database>;

interface AuthOverrides {
  signInWithOtp?: (args: unknown) => Promise<{ error: unknown }>;
  signInWithPassword?: (args: unknown) => Promise<{ error: unknown }>;
  verifyOtp?: (args: unknown) => Promise<{ error: unknown }>;
}

function fakeAuthClient(overrides: AuthOverrides = {}): Client {
  return {
    auth: {
      signInWithOtp: overrides.signInWithOtp ?? (async () => ({ error: null })),
      signInWithPassword: overrides.signInWithPassword ?? (async () => ({ error: null })),
      verifyOtp: overrides.verifyOtp ?? (async () => ({ error: null })),
    },
  } as unknown as Client;
}

function fakeProfileClient(result: { data: unknown; error: unknown }): Client {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => result,
    maybeSingle: async () => result,
  };
  return { from: () => builder } as unknown as Client;
}

test('requestEmailOtp sends a closed-signup code without a redirect URL', async () => {
  let received: { email: string; options: { shouldCreateUser: boolean } } | undefined;
  const client = fakeAuthClient({
    signInWithOtp: async (args) => {
      received = args as typeof received;
      return { error: null };
    },
  });

  await requestEmailOtp(client, { email: 'player@example.com' });

  expect(received?.email).toBe('player@example.com');
  expect(received?.options.shouldCreateUser).toBe(false);
  expect(received?.options).not.toHaveProperty('emailRedirectTo');
});

test('requestEmailOtp surfaces a rate limit as AUTH-5', async () => {
  const client = fakeAuthClient({
    signInWithOtp: async () => ({ error: { status: 429, message: 'Email rate limit exceeded' } }),
  });
  try {
    await requestEmailOtp(client, { email: 'p@example.com' });
    throw new Error('expected requestEmailOtp to throw');
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

test('signInWithAccessCode derives the internal identifier and submits the canonical whole code', async () => {
  let received: { email: string; password: string } | undefined;
  const client = fakeAuthClient({
    signInWithPassword: async (args) => {
      received = args as typeof received;
      return { error: null };
    },
  });

  await signInWithAccessCode(client, { accessCode: 'ABCD EFGH JKMP' });

  expect(received).toEqual({
    email: 'abcd@ramassa.invalid',
    password: 'abcd-efgh-jkmp',
  });
});

test('signInWithAccessCode exposes only AUTH-6 and transport status on failure', async () => {
  const client = fakeAuthClient({
    signInWithPassword: async () => ({
      error: { status: 400, message: 'Invalid login credentials' },
    }),
  });

  try {
    await signInWithAccessCode(client, { accessCode: 'ABCD EFGH JKMP' });
    throw new Error('expected signInWithAccessCode to throw');
  } catch (error) {
    expect(error).toMatchObject({ code: 'AUTH-6', context: { status: 400 } });
    expect(JSON.stringify(error)).not.toContain('abcd-efgh-jkmp');
    expect(JSON.stringify(error)).not.toContain('@ramassa.invalid');
  }
});

test('verifyEmailOtp binds the one-time code to the expected email', async () => {
  let received: { email: string; token: string; type: string } | undefined;
  const client = fakeAuthClient({
    verifyOtp: async (args) => {
      received = args as typeof received;
      return { error: null };
    },
  });

  await verifyEmailOtp(client, {
    email: 'player@example.com',
    token: '123456',
  });

  expect(received).toEqual({ email: 'player@example.com', token: '123456', type: 'email' });
});

test('verifyEmailOtp maps an expired or invalid code to AUTH-4', async () => {
  const client = fakeAuthClient({
    verifyOtp: async () => ({ error: { status: 403, message: 'Token has expired or is invalid' } }),
  });
  await expect(
    verifyEmailOtp(client, { email: 'player@example.com', token: '000000' }),
  ).rejects.toMatchObject({ code: 'AUTH-4' });
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

// fetchProfileSummary: the onboarding gate's data source. The distinction that
// matters is MISSING ROW (an expected state for a brand-new player, returns
// null) versus LOOKUP FAILURE (throws): conflating them either spams error
// reporting for every new signup or, worse, routes an onboarded player back
// into the wizard whenever the network flakes.

test('fetchProfileSummary returns role and terms timestamp for an existing profile', async () => {
  const summary = await fetchProfileSummary(
    fakeProfileClient({
      data: { role: 'player', terms_accepted_at: '2026-07-01T10:00:00Z', is_active: true },
      error: null,
    }),
    'user-1',
  );
  expect(summary).toEqual({ role: 'player', termsAcceptedAt: '2026-07-01T10:00:00Z' });
});

test('fetchProfileSummary returns null for a missing profile, without throwing', async () => {
  const summary = await fetchProfileSummary(
    fakeProfileClient({ data: null, error: null }),
    'user-1',
  );
  expect(summary).toBeNull();
});

test('fetchProfileSummary throws a typed error on lookup failure', async () => {
  try {
    await fetchProfileSummary(
      fakeProfileClient({ data: null, error: { message: 'boom' } }),
      'user-1',
    );
    throw new Error('expected fetchProfileSummary to throw');
  } catch (error) {
    expect(isAppError(error)).toBe(true);
  }
});

test('fetchProfileSummary rejects an inactive profile', async () => {
  expect(
    fetchProfileSummary(
      fakeProfileClient({
        data: { role: 'entity', terms_accepted_at: '2026-07-01T10:00:00Z', is_active: false },
        error: null,
      }),
      'user-1',
    ),
  ).rejects.toMatchObject({ code: 'AUTH-1' });
});

test('fetchProfileSummary rejects an unknown role value', async () => {
  try {
    await fetchProfileSummary(
      fakeProfileClient({
        data: { role: 'wizard', terms_accepted_at: null, is_active: true },
        error: null,
      }),
      'user-1',
    );
    throw new Error('expected fetchProfileSummary to throw');
  } catch (error) {
    expect(isAppError(error)).toBe(true);
  }
});
