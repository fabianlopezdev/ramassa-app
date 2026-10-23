/**
 * The registration board's screens (RAPP-641): every screen of her onboarding
 * in the order her phone walks them, as the board and the screen editors name
 * and address them.
 *
 * The board lists every live staff screen, also one with no question for her
 * yet: a screen just added must show on the board so staff can fill it. Her
 * phone skips a screen with nothing to ask, and the card says so. The summary,
 * the terms and the season authorization always end the onboarding (legal),
 * so they come last, locked.
 */

import {
  customStepId,
  customStepKey,
  FINAL_WIZARD_SCREENS,
  isEditableWizardScreen,
  WIZARD_QUESTION_SCREENS,
  wizardFlowOrder,
  type EditableWizardScreen,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  isAskedOfHer,
  wizardFlow,
  type IntakeCatalog,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';

/** The screens that always end the onboarding, in order. */
export const LOCKED_STEPS = ['summary', 'terms-intro', 'terms', 'authorization'] as const;
export type LockedStep = (typeof LOCKED_STEPS)[number];

export type BoardStep =
  | { readonly kind: 'custom'; readonly key: WizardStepKey; readonly screen: IntakeScreen }
  | { readonly kind: 'builtin'; readonly key: WizardQuestionScreen }
  | { readonly kind: 'locked'; readonly key: LockedStep };

export function liveScreens(catalog: IntakeCatalog): readonly IntakeScreen[] {
  return catalog.screens.filter((screen) => !screen.isArchived);
}

/** The movable steps in her order: the app's question screens and every live staff screen. */
export function movableOrder(catalog: IntakeCatalog): readonly WizardStepKey[] {
  const final = new Set<string>(FINAL_WIZARD_SCREENS);
  return wizardFlowOrder(
    liveScreens(catalog).map((screen) => ({
      id: screen.id,
      afterScreen: screen.afterScreen,
      isAnswered: false,
    })),
    wizardFlow(catalog),
  ).filter((step) => !final.has(step));
}

function isQuestionScreen(step: string): step is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(step);
}

function isLockedStep(step: string): step is LockedStep {
  return (LOCKED_STEPS as readonly string[]).includes(step);
}

/** One step of the board from its key, or null for a step the catalog no longer has. */
export function boardStep(catalog: IntakeCatalog, key: string): BoardStep | null {
  if (isLockedStep(key)) return { kind: 'locked', key };
  if (isQuestionScreen(key)) return { kind: 'builtin', key };
  const id = customStepId(key);
  const screen = id === null ? undefined : liveScreens(catalog).find((each) => each.id === id);
  return screen === undefined ? null : { kind: 'custom', key: customStepKey(screen.id), screen };
}

/** The step a `/onboarding/screens/<id>` address opens: a built-in name or a staff screen id. */
export function stepFromRouteId(catalog: IntakeCatalog, routeId: string): BoardStep | null {
  if (isLockedStep(routeId) || isQuestionScreen(routeId)) return boardStep(catalog, routeId);
  return boardStep(catalog, customStepKey(routeId));
}

/** The address segment of a step. */
export function routeIdOf(key: string): string {
  return customStepId(key) ?? key;
}

/** Every step in her order: the movable ones, then the locked ones. */
export function allSteps(catalog: IntakeCatalog): readonly BoardStep[] {
  return [...movableOrder(catalog), ...LOCKED_STEPS]
    .map((key) => boardStep(catalog, key))
    .filter((step): step is BoardStep => step !== null);
}

/** A staff screen her phone shows: it holds a live question asked of her. */
export function isShownToHer(screen: IntakeScreen): boolean {
  return screen.questions.some((question) => !question.isArchived && isAskedOfHer(question));
}

/** The wording a built-in or locked step edits, if any (the authorization has its own editor). */
export function editableScreenOf(step: BoardStep): EditableWizardScreen | null {
  return step.kind !== 'custom' && isEditableWizardScreen(step.key) ? step.key : null;
}
