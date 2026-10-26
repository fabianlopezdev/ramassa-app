/**
 * Where the onboarding design role may go in the admin (RAPP-615).
 *
 * A person whose only access is `onboarding.design` and `test_players.manage`
 * reaches the onboarding page, the two legal forms (RAPP-694, their own
 * boards since RAPP-696), the forms the team creates (RAPP-700), Dades de les jugadores (RAPP-650, its own page
 * since RAPP-654), the test players and her own account page (RAPP-634),
 * and every other admin URL sends her back. This is the screen half: the
 * database refuses her every other read and write on its own
 * (`private.limited_to_test_players`).
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

/**
 * The legal forms (RAPP-696): the authorization and terms drafts she writes,
 * each a board with its screens. The old Textos legals address (RAPP-694)
 * stays open so it forwards her there.
 */
function isLegalPath(pathname: string): boolean {
  return (
    pathname === '/legal' ||
    pathname === '/legal/' ||
    LEGAL_FORM_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

const LEGAL_FORM_PATHS = ['/forms/authorization', '/forms/terms'] as const;

/** The forms the team creates (RAPP-700): the list, each form and its screens. */
function isCustomFormPath(pathname: string): boolean {
  return pathname === '/forms/custom' || pathname.startsWith('/forms/custom/');
}

/** Dades de les jugadores (RAPP-650, RAPP-654) and Dades legals (RAPP-699). */
function isProfileLayoutPath(pathname: string): boolean {
  return ['/profile-layout', '/legal-data'].some(
    (path) => pathname === path || pathname === `${path}/`,
  );
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
  if (permissions.has('onboarding.design') && isLegalPath(pathname)) return null;
  if (permissions.has('onboarding.design') && isCustomFormPath(pathname)) return null;
  if (permissions.has('onboarding.design') && isProfileLayoutPath(pathname)) return null;
  if (permissions.has('test_players.manage') && isTestPlayerPath(pathname)) return null;
  return designRoleLanding(permissions);
}
