/**
 * Why a screen cannot be hidden (RAPP-711), as the `settings` key of the
 * reason staff read on the board's eye and beside the editor's switch. The
 * rule is the database's (`screenHideLock`): a required field or consent, or
 * a signature block, keeps a screen shown. A built-in screen also always
 * shows with a required question of its own, and the name screen always
 * shows (RAPP-708). Also why a screen cannot be deleted (RAPP-785).
 */

import type { WizardQuestionScreen } from '@ramassa/shared/intake';
import {
  canHideBuiltinScreen,
  fieldById,
  isNameField,
  requiredBuiltinQuestions,
  screenHideLock,
  type CustomFormScreen,
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

/**
 * Why a legal form's fixed screen (RAPP-772, RAPP-773) always shows and takes
 * no dependent screen, as `settings` keys. The screen she signs closes the
 * form; the re-registration screens are drawn by the app.
 */
export function fixedScreenLockKeys(screen: Pick<CustomFormScreen, 'systemScreen'>): {
  readonly hide: string;
  readonly addDependent: string;
} {
  const isClosing =
    screen.systemScreen === 'terms_sign' || screen.systemScreen === 'authorization_sign';
  return isClosing
    ? {
        hide: 'onboardingBoard.hideLockedClosing',
        addDependent: 'onboardingBoard.addDependentLockedClosing',
      }
    : {
        hide: 'onboardingBoard.hideLockedLegal',
        addDependent: 'onboardingBoard.addDependentLockedLegal',
      };
}

/**
 * Her Onboarding always asks her names (RAPP-782), so the database refuses to
 * delete a screen that asks them, or one whose dependent screens do
 * (RAPP-785). `family` is the screen first, then the screens deleted with it.
 */
export function namesDeletionLockKey(
  catalog: IntakeCatalog,
  family: readonly string[],
): 'deleteLockedNames' | 'deleteLockedDependentNames' | null {
  const layout = catalog.layout;
  if (layout === undefined) return null;
  const asksNames = (key: string) => {
    const screenKey = key.startsWith('custom:') ? key.slice(7) : key;
    return layout.placements.some((placement) => {
      if (placement.surface !== 'onboarding' || placement.screenKey !== screenKey) return false;
      const field = fieldById(layout, placement.fieldId);
      return field !== undefined && isNameField(field);
    });
  };
  const [root, ...dependents] = family;
  if (root !== undefined && asksNames(root)) return 'deleteLockedNames';
  return dependents.some(asksNames) ? 'deleteLockedDependentNames' : null;
}
