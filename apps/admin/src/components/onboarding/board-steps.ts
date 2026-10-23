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
 * so they come last, locked.
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
  flowSteps,
  LOCKED_STEPS,
  type FlowStep,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';

export {
  isShownToHer,
  liveScreens,
  LOCKED_STEPS,
  movableOrder,
  type LockedStep,
} from '@ramassa/shared/intake-builder';

export type BoardStep = FlowStep;

/** One step of the board from its key, or null for a step the catalog no longer has. */
export const boardStep = flowStep;

/** Every step in her order: the movable ones, then the locked ones. */
export const allSteps = flowSteps;

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

/** The address segment of a step. */
export function routeIdOf(key: string): string {
  return customStepId(key) ?? key;
}

/** The wording a built-in or locked step edits, if any (the authorization has its own editor). */
export function editableScreenOf(step: BoardStep): EditableWizardScreen | null {
  return step.kind !== 'custom' && isEditableWizardScreen(step.key) ? step.key : null;
}
