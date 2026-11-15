/**
 * Why a screen cannot be hidden (RAPP-711), as the `settings` key of the
 * reason staff read on the board's eye and beside the editor's switch. The
 * rule is the database's (`screenHideLock`): a required field or consent, or
 * a signature block, keeps a screen shown. A built-in screen also always
 * shows with a required question of its own, and the name screen always
 * shows (RAPP-708).
 */

import type { WizardQuestionScreen } from '@ramassa/shared/intake';
import {
  canHideBuiltinScreen,
  requiredBuiltinQuestions,
  screenHideLock,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';

/** The reason a team screen always shows, or null when it can be hidden. */
export function teamHideLockKey(
  catalog: IntakeCatalog,
  surface: 'onboarding' | 'custom_form',
  screenKey: string,
): string | null {
  const lock = screenHideLock(catalog, surface, screenKey);
  if (lock === null) return null;
  return lock === 'signature'
    ? 'onboardingBoard.hideLockedSignature'
    : 'onboardingBoard.hideLockedRequired';
}

/** The reason a built-in screen always shows, or null when it can be hidden. */
export function builtinHideLockKey(
  catalog: IntakeCatalog,
  screen: WizardQuestionScreen,
): string | null {
  if (screen === 'identity') return 'onboardingBoard.hideLockedName';
  if (!canHideBuiltinScreen(screen, requiredBuiltinQuestions(catalog))) {
    return 'builtinScreens.hideLocked';
  }
  return teamHideLockKey(catalog, 'onboarding', screen);
}
