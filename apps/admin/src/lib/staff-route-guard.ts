/**
 * The staff layout's route guard, run from `beforeLoad` (RAPP-615).
 *
 * TanStack Router runs a route's `beforeLoad` before any loader of the route
 * and its children: "If you throw an error in `beforeLoad`, none of its
 * children will attempt to load"
 * (https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes,
 * "The route.beforeLoad Option"). A redirect thrown here therefore stops a
 * forbidden page's loader before it asks the database anything; the earlier
 * component gate redirected only after the loaders had run.
 *
 * The guard reads the session and the permissions itself, because
 * `beforeLoad` runs outside React and cannot call `useAuth`. It is a screen
 * guard: the database still refuses the data on its own ("A route guard is not
 * a data authorization boundary", same page).
 */

import { designRoleRedirect } from '@/lib/design-role-access';
import { redirect } from '@tanstack/react-router';
import { fetchMyPermissions } from '@ramassa/shared/permissions';
import type { createSupabaseClient } from '@ramassa/shared/supabase';

export type StaffRouteGuardClient = ReturnType<typeof createSupabaseClient>;

/**
 * Throws a redirect when the signed-in design role opens a URL outside its two
 * areas. Signed out, it asks nothing: the sign-in gate handles that. When the
 * permissions cannot be read it throws, so no child loader runs either.
 */
export async function guardStaffRoute(
  client: StaffRouteGuardClient,
  pathname: string,
): Promise<void> {
  const { data } = await client.auth.getSession();
  if (data.session === null) return;
  const permissions = await fetchMyPermissions(client);
  const target = designRoleRedirect(pathname, permissions);
  if (target !== null) {
    throw redirect({ to: target, replace: true });
  }
}
