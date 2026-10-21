/**
 * The onboarding design role and test players (RAPP-615), as the screens see
 * them. The database applies the same rules (`private.limited_to_test_players`,
 * `private.can_design_onboarding`, `private.participant_permission`); these
 * only decide what a screen shows, never what a person may do.
 */

import { ONBOARDING_DESIGN_PERMISSIONS, type PermissionCode } from './catalog';

const DESIGN_PERMISSIONS: ReadonlySet<PermissionCode> = new Set(ONBOARDING_DESIGN_PERMISSIONS);

/**
 * True for a person whose only access is the design pair: she reaches the
 * onboarding settings and the test players, and nothing else.
 */
export function isLimitedToTestPlayers(permissions: ReadonlySet<PermissionCode>): boolean {
  const codes = [...permissions];
  return (
    codes.some((code) => DESIGN_PERMISSIONS.has(code)) &&
    codes.every((code) => DESIGN_PERMISSIONS.has(code))
  );
}

/** Who edits the onboarding: Settings' own permission, or the design role. */
export function canDesignOnboarding(permissions: ReadonlySet<PermissionCode>): boolean {
  return permissions.has('settings.organization') || permissions.has('onboarding.design');
}

/**
 * The "Test player" option of the invitation form. Whoever invites players
 * may turn it on; whoever creates test players only has it on, locked.
 */
export function testPlayerOption(
  permissions: ReadonlySet<PermissionCode>,
): 'hidden' | 'optional' | 'forced' {
  if (permissions.has('participants.invite')) return 'optional';
  if (permissions.has('test_players.manage')) return 'forced';
  return 'hidden';
}

/** Deleting a test player outright (RAPP-617). */
export function canDeleteTestPlayer(permissions: ReadonlySet<PermissionCode>): boolean {
  return permissions.has('test_players.manage') || permissions.has('rgpd.erase');
}
