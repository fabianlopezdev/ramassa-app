/**
 * Settings tabs that became their own pages when the menu grouped by audience
 * (RAPP-654). An old link, a bookmark or a bell row written before then
 * (`/settings?tab=profile-layout`) still opens the right page.
 *
 * Settings' own search schema keeps these tab values (and `entity`), because
 * the router rewrites the URL to the validated search before any `beforeLoad`
 * runs: a dropped `tab` would leave nothing to forward.
 *
 * Checked in the staff layout's `beforeLoad`, before the design role's guard:
 * that guard reads the path only, so it would send the design role from
 * `/settings?tab=profile-layout` back to the onboarding before Settings could
 * forward her to the Fitxa. A pure function, so the table is tested without a
 * router.
 */

/**
 * The `tab` values that now live on their own pages. The Questions tab held
 * the old question builder: its fields live on the Fitxa (RAPP-656).
 */
export const MOVED_SETTINGS_TABS = [
  'profile-layout',
  'questions',
  'referral-form',
  'staff',
  'entities',
  'authorization',
] as const;

export type MovedSettingsTab =
  | { readonly to: '/profile-layout' }
  | { readonly to: '/entities/referral-form' }
  | { readonly to: '/team' }
  | { readonly to: '/forms/authorization' }
  | { readonly to: '/entities'; readonly search: { readonly entity?: string } };

function isSettingsPath(pathname: string): boolean {
  return pathname === '/settings' || pathname === '/settings/';
}

/** Where an old Settings tab lives now, or null when the URL is not one of them. */
export function movedSettingsTab(
  pathname: string,
  search: Readonly<Record<string, unknown>>,
): MovedSettingsTab | null {
  if (!isSettingsPath(pathname)) return null;
  switch (search['tab']) {
    case 'profile-layout':
    case 'questions':
      return { to: '/profile-layout' };
    case 'referral-form':
      return { to: '/entities/referral-form' };
    case 'staff':
      return { to: '/team' };
    // The season authorization is a form of its own (RAPP-694, RAPP-696).
    case 'authorization':
      return { to: '/forms/authorization' };
    case 'entities': {
      const entity = search['entity'];
      return { to: '/entities', search: typeof entity === 'string' ? { entity } : {} };
    }
    default:
      return null;
  }
}
