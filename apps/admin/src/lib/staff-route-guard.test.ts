import { isRedirect } from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import { guardStaffRoute, type StaffRouteGuardClient } from './staff-route-guard';

/** A client whose session and `my_permissions` answer are fixed, recording each RPC. */
function fakeClient(options: {
  readonly signedIn: boolean;
  readonly permissions?: readonly string[];
  readonly permissionsFail?: boolean;
}): StaffRouteGuardClient & { readonly rpcCalls: string[] } {
  const rpcCalls: string[] = [];
  return {
    rpcCalls,
    auth: {
      getSession: async () => ({
        data: { session: options.signedIn ? { user: { id: 'design-account' } } : null },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (options.permissionsFail === true) {
        return { data: null, error: { message: 'network down' } };
      }
      return { data: options.permissions ?? [], error: null };
    },
  } as unknown as StaffRouteGuardClient & { readonly rpcCalls: string[] };
}

const DESIGN = ['onboarding.design', 'test_players.manage'];

async function redirectOf(promise: Promise<void>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (thrown) {
    if (isRedirect(thrown)) return String(thrown.options.to);
    throw thrown;
  }
}

describe('the staff layout guards before any loader runs (RAPP-615)', () => {
  test('the design role is redirected from a forbidden URL by a thrown redirect', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    for (const path of ['/dashboard', '/settings', '/messages', '/participants/invites']) {
      expect(await redirectOf(guardStaffRoute(client, path))).toBe('/onboarding');
    }
  });

  test('the design role reaches the onboarding and the test players', async () => {
    const client = fakeClient({ signedIn: true, permissions: DESIGN });
    for (const path of ['/onboarding', '/participants', '/participants/new']) {
      expect(await redirectOf(guardStaffRoute(client, path))).toBeNull();
    }
  });

  test('a test-players-only account lands on the participants', async () => {
    const client = fakeClient({ signedIn: true, permissions: ['test_players.manage'] });
    expect(await redirectOf(guardStaffRoute(client, '/dashboard'))).toBe('/participants');
  });

  test('other team members pass everywhere', async () => {
    const client = fakeClient({
      signedIn: true,
      permissions: ['impact.view', 'onboarding.design', 'participants.view'],
    });
    expect(await redirectOf(guardStaffRoute(client, '/dashboard'))).toBeNull();
  });

  test('without a session the guard asks nothing and leaves it to the sign-in gate', async () => {
    const client = fakeClient({ signedIn: false });
    expect(await redirectOf(guardStaffRoute(client, '/dashboard'))).toBeNull();
    expect(client.rpcCalls).toEqual([]);
  });

  test('when the permissions cannot be read the guard throws, so no child loader runs', async () => {
    const client = fakeClient({ signedIn: true, permissionsFail: true });
    let thrown: unknown = null;
    try {
      await guardStaffRoute(client, '/dashboard');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeNull();
    expect(isRedirect(thrown)).toBe(false);
  });
});
