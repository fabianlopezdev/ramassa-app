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
  permissions?: readonly string[];
  sessionCurrent?: boolean;
  termsNeeded?: boolean | 'error';
  secondFactorWaived?: boolean;
}) {
  const rpcCalls: string[] = [];
  const localSignOuts: string[] = [];
  let onChange: AuthChangeCallback = () => {};
  const channels: { name: string; filter: unknown; handler: () => void; removed: boolean }[] = [];
  // Mutable so a test can install a profile AFTER mount and call refreshProfile,
  // which is exactly what completing the wizard does.
  const state = {
    profile:
      options.profile ??
      ({
        data: {
          role: options.role ?? 'player',
          terms_accepted_at: '2026-07-01T10:00:00Z',
          is_active: true,
        },
        error: null,
      } as { data: unknown; error: unknown }),
    permissions: [...(options.permissions ?? [])] as string[],
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.initialSession } }),
      signOut: async ({ scope }: { scope: string }) => {
        localSignOuts.push(scope);
        onChange('SIGNED_OUT', null);
        return { error: null };
      },
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
    // `my_permissions`, read for team members only (RAPP-231).
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (name === 'my_session_is_current') {
        return { data: options.sessionCurrent ?? true, error: null };
      }
      // The app terms gate (RAPP-613), read for players only.
      // The staging waiver (RAPP-628), asked below aal2 for team members and entity contacts.
      if (name === 'my_second_factor_waived') {
        return { data: options.secondFactorWaived ?? false, error: null };
      }
      if (name === 'my_terms_acceptance_needed') {
        return options.termsNeeded === 'error'
          ? { data: null, error: { message: 'network' } }
          : { data: options.termsNeeded ?? false, error: null };
      }
      return { data: state.permissions, error: null };
    },
    channel: (name: string) => {
      const entry = { name, filter: null as unknown, handler: () => {}, removed: false };
      channels.push(entry);
      const channel = {
        on: (_type: string, filter: unknown, handler: () => void) => {
          entry.filter = filter;
          entry.handler = handler;
          return channel;
        },
        subscribe: () => channel,
        entry,
      };
      return channel;
    },
    removeChannel: async (channel: { entry: { removed: boolean } }) => {
      channel.entry.removed = true;
      return 'ok';
    },
  } as unknown as SupabaseClient<Database>;
  return {
    client,
    state,
    emit: (session: unknown) => onChange('SIGNED_IN', session),
    localSignOuts,
    channels,
    rpcCalls,
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
    profile: { data: { role: 'player', terms_accepted_at: null, is_active: true }, error: null },
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
    data: { role: 'player', terms_accepted_at: '2026-07-31T09:00:00Z', is_active: true },
    error: null,
  };
  await act(async () => {
    await latestRefresh?.();
  });
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|player|ok'));
});

function PermissionsProbe() {
  const { permissions, isLoading } = useAuth();
  return (
    <p data-testid="permissions">{isLoading ? 'loading' : [...permissions].sort().join(',')}</p>
  );
}

test('a team member carries her permissions, and signing out clears them (RAPP-231)', async () => {
  const { client, emit } = makeClient({
    initialSession: { user: { id: 'u1' } },
    role: 'staff',
    permissions: ['messages.inbox', 'attendance.mark'],
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <PermissionsProbe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(textContentOf(getByTestId('permissions'))).toBe('attendance.mark,messages.inbox'),
  );
  await act(async () => {
    emit(null);
  });
  await waitFor(() => expect(textContentOf(getByTestId('permissions'))).toBe(''));
});

test('a player has no permissions, whatever the server would return', async () => {
  const { client } = makeClient({
    initialSession: { user: { id: 'u2' } },
    role: 'player',
    permissions: ['messages.inbox'],
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <PermissionsProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('permissions'))).toBe(''));
});

test('a session ended remotely is signed out on this device (RAPP-234)', async () => {
  const { client, localSignOuts } = makeClient({
    initialSession: { user: { id: 'u1' } },
    role: 'staff',
    sessionCurrent: false,
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(localSignOuts).toEqual(['local']));
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|out|none|ok'));
});

test('a change to her access row reloads her permissions at once (RAPP-237)', async () => {
  const { client, state, channels } = makeClient({
    initialSession: { user: { id: '5eed0000-0000-4000-8000-000000000002' } },
    role: 'staff',
    permissions: ['attendance.mark'],
  });
  const { getByTestId, unmount } = render(
    <AuthProvider client={client}>
      <PermissionsProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('permissions'))).toBe('attendance.mark'));
  // The channel opens in its own effect, which a slow runner reaches after the
  // permissions have shown, so the test waits for it.
  const findChannel = () => channels.find((entry) => entry.name.startsWith('permissions:'));
  await waitFor(() =>
    expect(findChannel()?.filter).toEqual({
      event: '*',
      schema: 'public',
      table: 'team_member_access',
      filter: 'profile_id=eq.5eed0000-0000-4000-8000-000000000002',
    }),
  );
  const channel = findChannel();

  state.permissions = ['attendance.mark', 'messages.inbox'];
  await act(async () => channel?.handler());
  await waitFor(() =>
    expect(textContentOf(getByTestId('permissions'))).toBe('attendance.mark,messages.inbox'),
  );
  unmount();
  expect(channel?.removed).toBe(true);
});

test('a player opens no permission channel', async () => {
  const { client, channels } = makeClient({
    initialSession: { user: { id: 'u1' } },
    role: 'player',
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|player|ok'));
  expect(channels).toHaveLength(0);
});

test('a refresh with the same codes keeps the same permission set', async () => {
  const seen: ReadonlySet<string>[] = [];
  function SetProbe() {
    const { permissions, isLoading, refreshProfile } = useAuth();
    if (!isLoading) seen.push(permissions);
    latestRefresh = refreshProfile;
    return null;
  }
  const { client } = makeClient({
    initialSession: { user: { id: '5eed0000-0000-4000-8000-000000000003' } },
    role: 'staff',
    permissions: ['attendance.mark'],
  });
  render(
    <AuthProvider client={client}>
      <SetProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(seen.at(-1)?.has('attendance.mark')).toBe(true));
  const before = seen.at(-1);
  await act(async () => {
    await latestRefresh?.();
  });
  expect(seen.at(-1)).toBe(before);
});

function TermsProbe() {
  const { isLoading, needsTermsAcceptance } = useAuth();
  return (
    <span data-testid="terms">{`${isLoading ? 'loading' : 'ready'}|${String(needsTermsAcceptance)}`}</span>
  );
}

test('a player who has not accepted the current app terms must accept them (RAPP-613)', async () => {
  const { client } = makeClient({ initialSession: { user: { id: 'u1' } }, termsNeeded: true });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <TermsProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('terms'))).toBe('ready|true'));
});

test('a failed terms lookup lets her in, as the onboarding gate does', async () => {
  const { client } = makeClient({ initialSession: { user: { id: 'u1' } }, termsNeeded: 'error' });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <TermsProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('terms'))).toBe('ready|false'));
});

test('a team member is never asked about the app terms', async () => {
  const { client, rpcCalls } = makeClient({
    initialSession: { user: { id: 'u1' } },
    role: 'staff',
    termsNeeded: true,
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <TermsProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('terms'))).toBe('ready|false'));
  expect(rpcCalls).not.toContain('my_terms_acceptance_needed');
});

// An access token carrying these claims, as Supabase issues it (RAPP-628).
function sessionWithClaims(userId: string, claims: Record<string, unknown>) {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return {
    user: { id: userId },
    access_token: `${encode({ alg: 'none' })}.${encode({ sub: userId, ...claims })}.signature`,
  };
}

function SecondFactorProbe() {
  const {
    isLoading,
    needsSecondFactor,
    secondFactorWaived,
    permissions,
    permissionsAreCurrent,
    refreshProfile,
  } = useAuth();
  latestRefresh = refreshProfile;
  const state = `${isLoading ? 'loading' : 'ready'}|${needsSecondFactor ? 'verify' : 'open'}|${
    secondFactorWaived ? 'waived' : 'kept'
  }|${permissionsAreCurrent ? 'current' : 'stale'}|${[...permissions].sort().join(',')}`;
  return <span data-testid="second-factor">{state}</span>;
}

test('a waived test account at aal1 skips the second factor and reads her permissions (RAPP-628)', async () => {
  const { client } = makeClient({
    initialSession: sessionWithClaims('u1', { aal: 'aal1', session_id: 's1' }),
    role: 'staff',
    permissions: ['onboarding.design', 'test_players.manage'],
    secondFactorWaived: true,
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <SecondFactorProbe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(textContentOf(getByTestId('second-factor'))).toBe(
      'ready|open|waived|current|onboarding.design,test_players.manage',
    ),
  );
});

test('a real team member at aal1 still verifies her authenticator', async () => {
  const { client } = makeClient({
    initialSession: sessionWithClaims('u1', { aal: 'aal1', session_id: 's1' }),
    role: 'staff',
    permissions: [],
    secondFactorWaived: false,
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <SecondFactorProbe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(textContentOf(getByTestId('second-factor'))).toBe('ready|verify|kept|current|'),
  );
});

test('an entity contact can be waived too', async () => {
  const { client } = makeClient({
    initialSession: sessionWithClaims('u4', { aal: 'aal1', session_id: 's4' }),
    role: 'entity',
    secondFactorWaived: true,
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <SecondFactorProbe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(textContentOf(getByTestId('second-factor'))).toBe('ready|open|waived|current|'),
  );
});

test('a player and an aal2 session never ask about the waiver', async () => {
  const player = makeClient({
    initialSession: sessionWithClaims('u2', { aal: 'aal1', session_id: 's2' }),
    role: 'player',
    secondFactorWaived: true,
  });
  const playerView = render(
    <AuthProvider client={player.client}>
      <SecondFactorProbe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(textContentOf(playerView.getByTestId('second-factor'))).toBe('ready|open|kept|current|'),
  );
  expect(player.rpcCalls).not.toContain('my_second_factor_waived');
  playerView.unmount();

  const verified = makeClient({
    initialSession: sessionWithClaims('u1', { aal: 'aal2', session_id: 's1' }),
    role: 'admin',
    permissions: ['team.manage'],
    secondFactorWaived: true,
  });
  const verifiedView = render(
    <AuthProvider client={verified.client}>
      <SecondFactorProbe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(textContentOf(verifiedView.getByTestId('second-factor'))).toBe(
      'ready|open|kept|current|team.manage',
    ),
  );
  expect(verified.rpcCalls).not.toContain('my_second_factor_waived');
});

test('the waiver is asked once per session, not on every refresh', async () => {
  const { client, rpcCalls, emit } = makeClient({
    initialSession: sessionWithClaims('u1', { aal: 'aal1', session_id: 's1' }),
    role: 'staff',
    permissions: ['onboarding.design'],
    secondFactorWaived: true,
  });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <SecondFactorProbe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(textContentOf(getByTestId('second-factor'))).toBe(
      'ready|open|waived|current|onboarding.design',
    ),
  );
  // A token refresh keeps the session, and the wizard's refresh re-reads the profile.
  await act(async () => {
    emit(sessionWithClaims('u1', { aal: 'aal1', session_id: 's1', exp: 2 }));
  });
  await act(async () => {
    await latestRefresh?.();
  });
  await waitFor(() =>
    expect(textContentOf(getByTestId('second-factor'))).toBe(
      'ready|open|waived|current|onboarding.design',
    ),
  );
  expect(rpcCalls.filter((name) => name === 'my_second_factor_waived')).toHaveLength(1);

  // A new session asks again.
  await act(async () => {
    emit(sessionWithClaims('u1', { aal: 'aal1', session_id: 's2' }));
  });
  await waitFor(() =>
    expect(rpcCalls.filter((name) => name === 'my_second_factor_waived')).toHaveLength(2),
  );
});
