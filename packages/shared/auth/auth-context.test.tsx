import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, waitFor } from '@testing-library/react';
import { expect, test } from 'bun:test';
import type { Database } from '../types/database';
import { AuthProvider, useAuth } from './auth-context';

type AuthChangeCallback = (event: string, session: unknown) => void;

function makeClient(options: {
  initialSession: unknown;
  role?: string;
  profile?: { data: unknown; error: unknown };
}) {
  let onChange: AuthChangeCallback = () => {};
  // Mutable so a test can install a profile AFTER mount and call refreshProfile,
  // which is exactly what completing the wizard does.
  const state = {
    profile:
      options.profile ??
      ({
        data: { role: options.role ?? 'player', terms_accepted_at: '2026-07-01T10:00:00Z' },
        error: null,
      } as { data: unknown; error: unknown }),
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.initialSession } }),
      onAuthStateChange: (callback: AuthChangeCallback) => {
        onChange = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => state.profile }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  return {
    client,
    state,
    emit: (session: unknown) => onChange('SIGNED_IN', session),
  };
}

// This package compiles without DOM lib types (it is platform-neutral), so the
// rendered element's text is read through a minimal structural type.
function textContentOf(element: unknown): string | null {
  return (element as { textContent: string | null }).textContent;
}

let latestRefresh: (() => Promise<void>) | null = null;

function AuthProbe() {
  const { role, isLoading, session, needsOnboarding, refreshProfile } = useAuth();
  latestRefresh = refreshProfile;
  const state = `${isLoading ? 'loading' : 'ready'}|${session ? 'in' : 'out'}|${role ?? 'none'}|${
    needsOnboarding ? 'onboard' : 'ok'
  }`;
  return <span data-testid="probe">{state}</span>;
}

test('resolves an existing session and reads its role from the profile', async () => {
  const { client } = makeClient({ initialSession: { user: { id: 'u1' } }, role: 'player' });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|player|ok'));
});

test('with no session, finishes loading as signed out', async () => {
  const { client } = makeClient({ initialSession: null, role: 'player' });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|out|none|ok'));
});

test('a sign-out event clears the session and role', async () => {
  const { client, emit } = makeClient({ initialSession: { user: { id: 'u1' } }, role: 'staff' });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|staff|ok'));

  await act(async () => {
    emit(null);
  });
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|out|none|ok'));
});

// The onboarding gate's three states, and why each matters:
// missing profile -> the wizard (expected for every new player, NOT an error);
// lookup failure -> NOT the wizard (no evidence there is no profile) and the
// error is reported; completing the wizard -> refreshProfile flips the gate
// without a sign-out/sign-in round trip.

test('a session with no profile row needs onboarding, and reports no error', async () => {
  let reported = 0;
  const { client } = makeClient({
    initialSession: { user: { id: 'u-new' } },
    profile: { data: null, error: null },
  });
  const { getByTestId } = render(
    <AuthProvider client={client} onError={() => (reported += 1)}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|none|onboard'));
  expect(reported).toBe(0);
});

test('a profile lookup FAILURE does not route to the wizard, and is reported', async () => {
  let reported = 0;
  const { client } = makeClient({
    initialSession: { user: { id: 'u1' } },
    profile: { data: null, error: { message: 'boom' } },
  });
  const { getByTestId } = render(
    <AuthProvider client={client} onError={() => (reported += 1)}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|none|ok'));
  expect(reported).toBe(1);
});

test('a profile without terms acceptance still needs onboarding', async () => {
  const { client } = makeClient({
    initialSession: { user: { id: 'u1' } },
    profile: { data: { role: 'player', terms_accepted_at: null }, error: null },
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|player|onboard'));
});

test('refreshProfile flips the gate after the wizard completes', async () => {
  const { client, state } = makeClient({
    initialSession: { user: { id: 'u-new' } },
    profile: { data: null, error: null },
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|none|onboard'));

  state.profile = {
    data: { role: 'player', terms_accepted_at: '2026-07-31T09:00:00Z' },
    error: null,
  };
  await act(async () => {
    await latestRefresh?.();
  });
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|player|ok'));
});
