/**
 * Where the onboarding design role may go in the admin (RAPP-615).
 *
 * A person whose only access is `onboarding.design` and `test_players.manage`
 * reaches the onboarding page, the test players and her own account page
 * (RAPP-634), and every other admin URL
 * sends her back. This is the screen half: the database refuses her every
 * other read and write on its own (`private.limited_to_test_players`).
 *
 * A pure function, like `resolveRouteAccess`, so the whole URL table is tested
 * without a router.
 */

import { isLimitedToTestPlayers, type PermissionCode } from '@ramassa/shared/permissions';

export type DesignRoleLanding = '/onboarding' | '/participants';

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTestPlayerPath(pathname: string): boolean {
  const [area, child, ...rest] = pathname.split('/').filter((segment) => segment !== '');
  if (area !== 'participants' || rest.length > 0) return false;
  return child === undefined || child === 'new' || UUID_SEGMENT.test(child);
}

/** Her own account page (RAPP-634): every team member reaches it. */
function isOwnAccountPath(pathname: string): boolean {
  return pathname === '/account' || pathname === '/account/';
}

function isOnboardingPath(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}

export function designRoleLanding(permissions: ReadonlySet<PermissionCode>): DesignRoleLanding {
  return permissions.has('onboarding.design') ? '/onboarding' : '/participants';
}

/** Null when the path is open to her (or she is not the design role), else where to go. */
export function designRoleRedirect(
  pathname: string,
  permissions: ReadonlySet<PermissionCode>,
): DesignRoleLanding | null {
  if (!isLimitedToTestPlayers(permissions)) return null;
  if (isOwnAccountPath(pathname)) return null;
  if (permissions.has('onboarding.design') && isOnboardingPath(pathname)) return null;
  if (permissions.has('test_players.manage') && isTestPlayerPath(pathname)) return null;
  return designRoleLanding(permissions);
}
