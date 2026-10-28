/**
 * The registration board's screens (RAPP-641): every screen of her onboarding
 * in the order her phone walks them, as the board and the screen editors name
 * and address them.
 *
 * The order itself is shared (`@ramassa/shared/intake-builder`, RAPP-644), so
 * the board, a player's copy of it and the staff phone read the same steps.
 * The board lists every live staff screen, also one with no question for her
 * yet: a screen just added must show on the board so staff can fill it. Her
 * phone skips a screen with nothing to ask, and the card says so. The summary,
 * the terms and the season authorization always end the onboarding (legal),
 * so they come last, locked. The app terms and the authorization are forms of
 * their own (RAPP-696): each shows here as one card that opens its board.
 */

import {
  customStepId,
  customStepKey,
  isEditableWizardScreen,
  WIZARD_QUESTION_SCREENS,
  type EditableWizardScreen,
} from '@ramassa/shared/intake';
import {
  flowStep,
  LOCKED_STEPS,
  movableOrder,
  onboardingFamily,
  onboardingRoots,
  type FlowStep,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';

export { isShownToHer } from '@ramassa/shared/intake-builder';

export type BoardStep = FlowStep;

/**
 * The locked cards that end the Onboarding board (RAPP-696): the summary and
 * the app terms form (its two screens, "Abans dels termes" and "Termes i
 * signatura", in one card). The season authorization is a chained form below
 * the divider since RAPP-703, by default first. Her phone still walks every
 * screen in the same order (`LOCKED_STEPS`).
 */
export const BOARD_LOCKED_STEPS = ['summary', 'terms'] as const;

/** One step of the board from its key, or null for a step the catalog no longer has. */
export const boardStep = flowStep;

/** Every card of the board in her order: the movable ones, then the locked ones. */
export function allSteps(catalog: IntakeCatalog): readonly FlowStep[] {
  return [...movableOrder(catalog), ...BOARD_LOCKED_STEPS]
    .map((key) => flowStep(catalog, key))
    .filter((step): step is FlowStep => step !== null);
}

/** The step a `/onboarding/screens/<id>` address opens: a built-in name or a staff screen id. */
export function stepFromRouteId(catalog: IntakeCatalog, routeId: string): BoardStep | null {
  if (
    (LOCKED_STEPS as readonly string[]).includes(routeId) ||
    (WIZARD_QUESTION_SCREENS as readonly string[]).includes(routeId)
  ) {
    return flowStep(catalog, routeId);
  }
  return flowStep(catalog, customStepKey(routeId));
}

/**
 * The form a step's card opens (RAPP-696): the app terms and the season
 * authorization are forms of their own. Null for a screen of the Onboarding.
 */
export function linkedFormOf(
  key: string,
): { readonly to: '/forms/terms' | '/forms/authorization'; readonly labelKey: string } | null {
  if (key === 'authorization')
    return { to: '/forms/authorization', labelKey: 'nav:staff.authorization' };
  if (key === 'terms') return { to: '/forms/terms', labelKey: 'nav:staff.appTerms' };
  return null;
}

/** The address segment of a step. */
export function routeIdOf(key: string): string {
  return customStepId(key) ?? key;
}

/** The wording a built-in or locked step edits, if any (the authorization has its own editor). */
export function editableScreenOf(step: BoardStep): EditableWizardScreen | null {
  return step.kind !== 'custom' && isEditableWizardScreen(step.key) ? step.key : null;
}

/**
 * The number each step carries on the board (RAPP-715): the screens that
 * depend on no answer by their place ("3"), every follow-up below one by its
 * letter and depth ("3a", "3a.1"), the app's own follow-ups included.
 */
export function boardNumbers(catalog: IntakeCatalog): ReadonlyMap<string, string> {
  const order = movableOrder(catalog);
  const numbers = new Map<string, string>();
  [...onboardingRoots(catalog, order), ...BOARD_LOCKED_STEPS]
    .filter((key) => flowStep(catalog, key) !== null)
    .forEach((key, index) => {
      for (const member of onboardingFamily(catalog, key, String(index + 1), order)) {
        numbers.set(member.key, member.number);
      }
    });
  return numbers;
}

/** How many cards the board numbers: the screens that depend on no answer. */
export function boardRootCount(catalog: IntakeCatalog): number {
  return (
    onboardingRoots(catalog, movableOrder(catalog)).length +
    BOARD_LOCKED_STEPS.filter((key) => flowStep(catalog, key) !== null).length
  );
}
