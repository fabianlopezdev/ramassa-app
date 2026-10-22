import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test } from 'bun:test';
import { isAppError } from '../errors';
import type { Database } from '../types/database';
import {
  fetchProfileRole,
  fetchProfileSummary,
  requestEmailOtp,
  signInWithPassword,
  verifyEmailCode,
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

test.each([
  [{ status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' }, 'AUTH-10'],
  [{ status: 422, code: 'otp_disabled', message: 'OTP login is disabled' }, 'AUTH-1'],
  [{ status: 422, code: 'email_address_invalid', message: 'Invalid email' }, 'AUTH-11'],
  [{ status: 403, code: 'email_address_not_authorized', message: 'SMTP restriction' }, 'AUTH-1'],
  [{ status: 0, name: 'AuthRetryableFetchError', message: 'Network request failed' }, 'NETWORK-1'],
  [{ status: 503, name: 'AuthRetryableFetchError', message: 'Service unavailable' }, 'AUTH-1'],
  [{ status: 500, code: 'unexpected_failure', message: 'Internal server error' }, 'AUTH-1'],
] as const)(
  'email request maps %j to actionable guidance %s and retains diagnostics',
  async (providerError, expectedCode) => {
    const client = fakeAuthClient({ signInWithOtp: async () => ({ error: providerError }) });
    await expect(requestEmailOtp(client, { email: 'player@example.com' })).rejects.toMatchObject({
      code: expectedCode,
      message: providerError.message,
      context: {
        status: providerError.status,
        authCode: 'code' in providerError ? providerError.code : undefined,
      },
    });
  },
);

describe('the staging fixed code for test accounts (RAPP-616)', () => {
  function stagingClient(options: {
    readonly normal: { error: unknown };
    readonly invoke?: { data: unknown; error: unknown };
    readonly hashVerify?: { error: unknown };
  }) {
    const calls: unknown[] = [];
    const client = {
      auth: {
        verifyOtp: async (args: Record<string, unknown>) => {
          calls.push(['verifyOtp', args]);
          return 'token_hash' in args ? (options.hashVerify ?? { error: null }) : options.normal;
        },
      },
      functions: {
        invoke: async (name: string, args: unknown) => {
          calls.push(['invoke', name, args]);
          return options.invoke ?? { data: { token_hash: 'hash' }, error: null };
        },
      },
    } as unknown as Client;
    return { client, calls };
  }

  const refused = { error: { status: 403, message: 'Token has expired or is invalid' } };

  test('the emailed code is tried first, and when it works the function is never called', async () => {
    const { client, calls } = stagingClient({ normal: { error: null } });
    await verifyEmailCode(
      client,
      { email: 'a@example.test', token: '123456' },
      { testSignIn: true },
    );
    expect(calls).toEqual([
      ['verifyOtp', { email: 'a@example.test', token: '123456', type: 'email' }],
    ]);
  });

  test('a build without the flag never calls the function, and keeps the normal error', async () => {
    const { client, calls } = stagingClient({ normal: refused });
    await expect(
      verifyEmailCode(client, { email: 'a@example.test', token: '123456' }, { testSignIn: false }),
    ).rejects.toMatchObject({ code: 'AUTH-4' });
    expect(calls).toHaveLength(1);
  });

  test('with the flag, a refused code asks the function and trades its hash for a session', async () => {
    const { client, calls } = stagingClient({ normal: refused });
    await verifyEmailCode(
      client,
      { email: 'a@example.test', token: '123456' },
      { testSignIn: true },
    );
    expect(calls).toEqual([
      ['verifyOtp', { email: 'a@example.test', token: '123456', type: 'email' }],
      ['invoke', 'test-sign-in', { body: { email: 'a@example.test', code: '123456' } }],
      ['verifyOtp', { token_hash: 'hash', type: 'email' }],
    ]);
  });

  test('when the function refuses too, the person sees the normal invalid-code error', async () => {
    const { client } = stagingClient({
      normal: refused,
      invoke: { data: null, error: { message: 'Edge Function returned a non-2xx status code' } },
    });
    await expect(
      verifyEmailCode(client, { email: 'a@example.test', token: '123456' }, { testSignIn: true }),
    ).rejects.toMatchObject({ code: 'AUTH-4' });
  });

  test('a hash that does not verify also ends in the normal error', async () => {
    const { client } = stagingClient({ normal: refused, hashVerify: refused });
    await expect(
      verifyEmailCode(client, { email: 'a@example.test', token: '123456' }, { testSignIn: true }),
    ).rejects.toMatchObject({ code: 'AUTH-4' });
  });
});
