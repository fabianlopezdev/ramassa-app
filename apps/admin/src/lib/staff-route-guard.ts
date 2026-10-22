/**
 * The staff layout's route guard, run from `beforeLoad` (RAPP-615).
 *
 * TanStack Router runs a route's `beforeLoad` before any loader of the route
 * and its children: "If you throw an error in `beforeLoad`, none of its
 * children will attempt to load"
 * (https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes,
 * "The route.beforeLoad Option"). A redirect thrown here therefore stops a
 * page's loader before it asks the database anything.
 *
 * Two redirects:
 *   - a team member whose session is not verified with her authenticator yet
 *     (assurance level aal1) goes to the second-factor step on the login page.
 *     The database refuses her everything at aal1, so a page loader would only
 *     get a refusal and flash the error page. Supabase's own check: "if you
 *     receive a currentLevel which is aal1 but a nextLevel of aal2, the user
 *     should be given the option to go through MFA"
 *     (https://supabase.com/docs/guides/auth/auth-mfa/totp, "Add a challenge
 *     step to sign in"). A team member without an authenticator yet (aal1,
 *     aal1) must set one up, so her role decides (RAPP-233). On staging, a
 *     test account whose second factor is waived (RAPP-628) is let through
 *     at aal1, as the database lets her in.
 *   - the design role, outside its two areas, goes back to them.
 *
 * The guard reads the session and the permissions itself, because
 * `beforeLoad` runs outside React and cannot call `useAuth`. The permissions
 * are kept in a per-session cache that the router context carries
 * (https://tanstack.com/router/latest/docs/framework/react/guide/router-context),
 * so a navigation adds no round trip. It is a screen guard: the database still
 * refuses the data on its own ("A route guard is not a data authorization
 * boundary", same page).
 */

import { designRoleRedirect } from '@/lib/design-role-access';
import { redirect } from '@tanstack/react-router';
import {
  fetchProfileSummary,
  fetchSecondFactorWaived,
  needsSecondFactor,
} from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import { fetchMyPermissions, type PermissionCode } from '@ramassa/shared/permissions';
import type { AppRole } from '@ramassa/shared/schemas';
import type { createSupabaseClient } from '@ramassa/shared/supabase';

export type StaffRouteGuardClient = ReturnType<typeof createSupabaseClient>;

/**
 * What the guard learned about the signed-in person, kept for her session:
 * her role and whether her second factor is waived (both read only while her
 * session is aal1), and her permissions at aal2 (or at aal1 when waived).
 * A failed read is dropped, so the next navigation asks again and a passing
 * network error never closes the staff area for good.
 */
export interface StaffAccessCache {
  role(userId: string, load: () => Promise<AppRole | null>): Promise<AppRole | null>;
  /** Whether her second factor is waived on staging (RAPP-628). */
  secondFactorWaived(userId: string, load: () => Promise<boolean>): Promise<boolean>;
  permissions(
    userId: string,
    load: () => Promise<ReadonlySet<PermissionCode>>,
  ): Promise<ReadonlySet<PermissionCode>>;
  /** The permissions the auth state read, live after a change (RAPP-237). */
  rememberPermissions(userId: string, permissions: ReadonlySet<PermissionCode>): void;
  clear(): void;
}

function memo<Value>() {
  const entries = new Map<string, Promise<Value>>();
  return {
    get(key: string, load: () => Promise<Value>): Promise<Value> {
      const kept = entries.get(key);
      if (kept !== undefined) return kept;
      const loading = load();
      entries.set(key, loading);
      loading.catch(() => {
        if (entries.get(key) === loading) entries.delete(key);
      });
      return loading;
    },
    set(key: string, value: Value): void {
      entries.set(key, Promise.resolve(value));
    },
    clear(): void {
      entries.clear();
    },
  };
}

export function createStaffAccessCache(): StaffAccessCache {
  const roles = memo<AppRole | null>();
  const waivers = memo<boolean>();
  const permissions = memo<ReadonlySet<PermissionCode>>();
  return {
    role: (userId, load) => roles.get(userId, load),
    secondFactorWaived: (userId, load) => waivers.get(userId, load),
    permissions: (userId, load) => permissions.get(userId, load),
    rememberPermissions: (userId, next) => permissions.set(userId, next),
    clear: () => {
      roles.clear();
      waivers.clear();
      permissions.clear();
    },
  };
}

/** Only a path inside the admin is taken back after the second factor. */
export function isInternalPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value);
}

/**
 * Throws a redirect when a page must not load: to the second-factor step for
 * an unverified team session, or back to the design role's areas. Signed out,
 * it asks nothing: the sign-in gate handles that. When the permissions cannot
 * be read it throws, so no child loader runs, and the error page offers a retry.
 */
export async function guardStaffRoute(
  client: StaffRouteGuardClient,
  cache: StaffAccessCache,
  location: { readonly pathname: string; readonly href: string },
): Promise<void> {
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (session === null) return;
  const userId = session.user.id;

  // Read from the session itself; it rarely needs the network (same Supabase page).
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error !== null) {
    throw new AppError('AUTH-1', { message: assurance.error.message });
  }
  if (assurance.data.currentLevel !== 'aal2') {
    const mustVerify =
      assurance.data.nextLevel === 'aal2' ||
      needsSecondFactor(
        await cache.role(
          userId,
          async () => (await fetchProfileSummary(client, userId))?.role ?? null,
        ),
        session,
      );
    // A failed lookup keeps the second factor; the cache drops it, so the
    // next navigation asks again.
    const isWaived =
      mustVerify &&
      (await cache
        .secondFactorWaived(userId, () => fetchSecondFactorWaived(client))
        .catch(() => false));
    if (mustVerify && !isWaived) {
      throw redirect({
        to: '/login',
        search: isInternalPath(location.href) ? { next: location.href } : {},
        replace: true,
      });
    }
    // A player or a profile still being created: the layout's gate shows her
    // the right screen.
    if (!isWaived) return;
  }

  const permissions = await cache.permissions(userId, () => fetchMyPermissions(client));
  const target = designRoleRedirect(location.pathname, permissions);
  if (target !== null) {
    throw redirect({ to: target, replace: true });
  }
}
