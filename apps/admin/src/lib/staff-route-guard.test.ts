import { isRedirect } from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import {
  createStaffAccessCache,
  guardStaffRoute,
  type StaffAccessCache,
  type StaffRouteGuardClient,
} from './staff-route-guard';

type Level = 'aal1' | 'aal2';

/**
 * A client whose session, assurance level, profile role and `my_permissions`
 * answer are fixed, recording each RPC and each profile read.
 */
function fakeClient(options: {
  readonly signedIn: boolean;
  readonly level?: Level;
  /** `aal2` when she has a verified authenticator. */
  readonly nextLevel?: Level;
  readonly role?: string | null;
  readonly permissions?: readonly string[];
  readonly permissionsFail?: boolean;
}): StaffRouteGuardClient & {
  readonly rpcCalls: string[];
  readonly profileReads: string[];
  failPermissions: boolean;
} {
  const rpcCalls: string[] = [];
  const profileReads: string[] = [];
  const level = options.level ?? 'aal2';
  const state = { failPermissions: options.permissionsFail === true };
  const accessToken = `x.${btoa(JSON.stringify({ aal: level }))}.y`;
  const client = {
    rpcCalls,
    profileReads,
    get failPermissions() {
      return state.failPermissions;
    },
    set failPermissions(value: boolean) {
      state.failPermissions = value;
    },
    auth: {
      getSession: async () => ({
        data: {
          session: options.signedIn
            ? { access_token: accessToken, user: { id: 'design-account' } }
            : null,
        },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: level, nextLevel: options.nextLevel ?? level },
          error: null,
        }),
      },
    },
    from: (table: string) => {
      profileReads.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data:
            options.role === null
              ? null
              : { role: options.role ?? 'staff', terms_accepted_at: null, is_active: true },
          error: null,
        }),
      };
      return builder;
    },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (state.failPermissions) {
        return { data: null, error: { message: 'network down' } };
      }
      return { data: options.permissions ?? [], error: null };
    },
  };
  return client as unknown as StaffRouteGuardClient & {
    readonly rpcCalls: string[];
    readonly profileReads: string[];
    failPermissions: boolean;
  };
}

const DESIGN = ['onboarding.design', 'test_players.manage'];

async function redirectOf(
  client: StaffRouteGuardClient,
  path: string,
  cache: StaffAccessCache = createStaffAccessCache(),
): Promise<{ readonly to: string; readonly search: unknown } | null> {
  try {
    await guardStaffRoute(client, cache, { pathname: path, href: path });
    return null;
  } catch (thrown) {
    if (isRedirect(thrown)) {
      return { to: String(thrown.options.to), search: thrown.options.search };
    }
    throw thrown;
  }
}

async function targetOf(
  client: StaffRouteGuardClient,
  path: string,
  cache?: StaffAccessCache,
): Promise<string | null> {
  return (await redirectOf(client, path, cache))?.to ?? null;
}

describe('the staff layout guards before any loader runs (RAPP-615)', () => {
  test('the design role is redirected from a forbidden URL by a thrown redirect', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    for (const path of ['/dashboard', '/settings', '/messages', '/participants/invites']) {
      expect(await targetOf(client, path)).toBe('/onboarding');
    }
  });

  test('the design role reaches the onboarding and the test players', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    for (const path of ['/onboarding', '/participants', '/participants/new']) {
      expect(await targetOf(client, path)).toBeNull();
    }
  });

  test('a test-players-only account lands on the participants', async () => {
    const client = fakeClient({ signedIn: true, permissions: ['test_players.manage'] });
    expect(await targetOf(client, '/dashboard')).toBe('/participants');
  });

  test('other team members pass everywhere', async () => {
    const client = fakeClient({
      signedIn: true,
      permissions: ['impact.view', 'onboarding.design', 'participants.view'],
    });
    expect(await targetOf(client, '/dashboard')).toBeNull();
  });

  test('without a session the guard asks nothing and leaves it to the sign-in gate', async () => {
    const client = fakeClient({ signedIn: false });
    expect(await targetOf(client, '/dashboard')).toBeNull();
    expect(client.rpcCalls).toEqual([]);
    expect(client.profileReads).toEqual([]);
  });

  test('when the permissions cannot be read the guard throws, so no child loader runs', async () => {
    const client = fakeClient({ signedIn: true, permissionsFail: true });
    let thrown: unknown = null;
    try {
      await guardStaffRoute(client, createStaffAccessCache(), {
        pathname: '/dashboard',
        href: '/dashboard',
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeNull();
    expect(isRedirect(thrown)).toBe(false);
  });
});

describe('before the second factor no page loader runs (RAPP-615)', () => {
  test('a team member with an authenticator at aal1 goes to the second-factor step', async () => {
    const client = fakeClient({ signedIn: true, level: 'aal1', nextLevel: 'aal2' });
    const target = await redirectOf(client, '/dashboard?tab=x');
    expect(target?.to).toBe('/login');
    expect(target?.search).toEqual({ next: '/dashboard?tab=x' });
    // Nothing that needs aal2 is asked first, not even the permissions.
    expect(client.rpcCalls).toEqual([]);
  });

  test('a staff member who must still set one up goes there too', async () => {
    const client = fakeClient({ signedIn: true, level: 'aal1', nextLevel: 'aal1', role: 'staff' });
    expect(await targetOf(client, '/participants')).toBe('/login');
    expect(client.rpcCalls).toEqual([]);
  });

  test('an admin who must set one up goes there too', async () => {
    const client = fakeClient({ signedIn: true, level: 'aal1', nextLevel: 'aal1', role: 'admin' });
    expect(await targetOf(client, '/settings')).toBe('/login');
  });

  test('a player at aal1 is left to the layout gate, which shows her no admin', async () => {
    const client = fakeClient({ signedIn: true, level: 'aal1', nextLevel: 'aal1', role: 'player' });
    expect(await targetOf(client, '/dashboard')).toBeNull();
    expect(client.rpcCalls).toEqual([]);
  });
});

describe('the guard reads the permissions once per session (RAPP-615)', () => {
  test('many navigations ask my_permissions once', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    const cache = createStaffAccessCache();
    for (const path of ['/onboarding', '/participants', '/dashboard', '/participants/new']) {
      await redirectOf(client, path, cache);
    }
    expect(client.rpcCalls.filter((name) => name === 'my_permissions')).toHaveLength(1);
  });

  test('parallel navigations share one read', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    const cache = createStaffAccessCache();
    await Promise.all(
      ['/onboarding', '/participants', '/dashboard'].map((p) => redirectOf(client, p, cache)),
    );
    expect(client.rpcCalls).toEqual(['my_permissions']);
  });

  test('a failed read is not kept: the next navigation asks again', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN, permissionsFail: true });
    const cache = createStaffAccessCache();
    await expect(redirectOf(client, '/onboarding', cache)).rejects.toBeDefined();
    client.failPermissions = false;
    expect(await targetOf(client, '/dashboard', cache)).toBe('/onboarding');
    expect(client.rpcCalls).toEqual(['my_permissions', 'my_permissions']);
  });

  test('a permission change heard live replaces the stored answer without a read', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    const cache = createStaffAccessCache();
    expect(await targetOf(client, '/dashboard', cache)).toBe('/onboarding');
    cache.rememberPermissions('design-account', new Set(['impact.view', 'participants.view']));
    expect(await targetOf(client, '/dashboard', cache)).toBeNull();
    expect(client.rpcCalls).toEqual(['my_permissions']);
  });

  test('clearing it makes the next navigation read again', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    const cache = createStaffAccessCache();
    await redirectOf(client, '/onboarding', cache);
    cache.clear();
    await redirectOf(client, '/onboarding', cache);
    expect(client.rpcCalls).toEqual(['my_permissions', 'my_permissions']);
  });
});
