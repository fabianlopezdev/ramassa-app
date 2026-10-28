/**
 * Screens that depend on an answer (RAPP-715), read from the catalog: where
 * each one's question lives (its parent), its family on the board, and
 * whether it opens for her answers.
 *
 * One model for every screen (`onboarding/screen-conditions.ts`): a team
 * screen of Onboarding or of a form stores its condition, and the app's own
 * follow-ups (`DETAIL_SCREEN_BRANCHES`) are the same condition with the app's
 * field and options named by key, read here as this organization's ids. The
 * board, the screen editor and her phone all read these functions.
 *
 * The parent is the screen where the condition's field is placed on the same
 * form. A screen whose question is asked nowhere on its form has no parent: it
 * keeps its own place and opens only for a stored answer that matches. A
 * hidden screen hides its follow-ups.
 */
import {
  customStepId,
  customStepKey,
  isCustomStep,
  WIZARD_QUESTION_SCREENS,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '../onboarding/intake';
import {
  branchesAfterParents,
  conditionsHold,
  familyNumbers,
  type ScreenCondition,
} from '../onboarding/screen-conditions';
import {
  DETAIL_SCREEN_BRANCHES,
  detailScreensOf,
  type DetailScreen,
  type DetailScreenBranch,
} from '../onboarding/screen-texts';
import { systemFieldsOf, wizardFlow, type IntakeCatalog, type RamassaScreen } from './builder';
import type { CustomForm, CustomFormScreen } from './custom-form-model';
import { placementOn } from './profile-layout';

// The app's own follow-ups --------------------------------------------------------------------------

/** An app follow-up's condition as this organization's ids; null when its field is missing. */
export function appBranchCondition(
  catalog: IntakeCatalog,
  branch: DetailScreenBranch,
): ScreenCondition | null {
  const field = systemFieldsOf(catalog).get(branch.condition.field);
  if (field === undefined) return null;
  return {
    fieldId: field.id,
    values: field.options
      .filter((option) => option.key !== null && branch.condition.answers.includes(option.key))
      .map((option) => option.id),
  };
}

export function isDetailScreen(key: string): key is DetailScreen {
  return DETAIL_SCREEN_BRANCHES.some((branch) => branch.screen === key);
}

export function detailBranch(key: DetailScreen): DetailScreenBranch {
  return DETAIL_SCREEN_BRANCHES.find((branch) => branch.screen === key) as DetailScreenBranch;
}

// Onboarding ----------------------------------------------------------------------------------------

function isQuestionScreen(key: string): key is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(key);
}

/** The step holding a team screen's question: an app screen or `custom:<id>`; null for none. */
export function onboardingScreenParent(
  catalog: IntakeCatalog,
  screen: Pick<RamassaScreen, 'showWhen'>,
): WizardStepKey | null {
  if (screen.showWhen === undefined || catalog.layout === undefined) return null;
  const placement = placementOn(catalog.layout, screen.showWhen.fieldId, 'onboarding');
  const key = placement?.screenKey ?? null;
  if (key === null) return null;
  if (isQuestionScreen(key)) return key;
  return catalog.screens.some((each) => each.id === key && !each.isArchived)
    ? customStepKey(key)
    : null;
}

/**
 * The conditions her answers must meet for a team screen to open: its own and
 * those of every team screen above it. Null when it never shows: it, or a
 * screen above it, is hidden or deleted.
 */
export function onboardingOpensWhen(
  catalog: IntakeCatalog,
  screen: RamassaScreen,
): readonly ScreenCondition[] | null {
  const hiddenApp = wizardFlow(catalog).hiddenScreens;
  const conditions: ScreenCondition[] = [];
  let current: RamassaScreen | undefined = screen;
  for (let depth = 0; current !== undefined && depth < 64; depth += 1) {
    if (current.isArchived || current.isHidden === true) return null;
    if (current.showWhen === undefined) return conditions;
    conditions.push(current.showWhen);
    const parent = onboardingScreenParent(catalog, current);
    if (parent === null) return conditions;
    const id = customStepId(parent);
    if (id === null) return hiddenApp.has(parent as WizardQuestionScreen) ? null : conditions;
    current = catalog.screens.find((each) => each.id === id);
  }
  return current === undefined ? null : conditions;
}

/** Whether a team screen of Onboarding opens for her answers by field id. */
export function onboardingScreenOpens(
  catalog: IntakeCatalog,
  screen: RamassaScreen,
  answers: Readonly<Record<string, unknown>>,
): boolean {
  const conditions = onboardingOpensWhen(catalog, screen);
  return conditions !== null && conditionsHold(conditions, answers);
}

/** The step holding a step's question (RAPP-715): for a team screen, an app follow-up, or none. */
export function onboardingParentOf(catalog: IntakeCatalog, key: string): string | null {
  if (isDetailScreen(key)) return detailBranch(key).parent;
  const id = customStepId(key);
  if (id === null) return null;
  const screen = catalog.screens.find((each) => each.id === id);
  return screen === undefined ? null : onboardingScreenParent(catalog, screen);
}

/**
 * The follow-ups of a step, in her order: the app's own first (the document
 * screen's three), then the team's, as the stored order places them.
 */
export function onboardingBranchKeys(
  catalog: IntakeCatalog,
  key: string,
  order: readonly string[],
): readonly string[] {
  return [
    ...detailScreensOf(key).map((branch) => branch.screen),
    ...order.filter((step) => isCustomStep(step) && onboardingParentOf(catalog, step) === key),
  ];
}

/** The top of a step's family: the screen none of its ancestors depends on. */
export function onboardingRootOf(catalog: IntakeCatalog, key: string): string {
  let current = key;
  for (let depth = 0; depth < 64; depth += 1) {
    const parent = onboardingParentOf(catalog, current);
    if (parent === null) return current;
    current = parent;
  }
  return current;
}

/**
 * A screen's family as one flat list, depth first, numbered from the root's
 * number: "3", "3a", "3b", "3a.1". `order` is the movable order.
 */
export function onboardingFamily(
  catalog: IntakeCatalog,
  root: string,
  rootNumber: string,
  order: readonly string[],
) {
  return familyNumbers(root, rootNumber, (key) => onboardingBranchKeys(catalog, key, order));
}

/** Whether a step of the movable order is a follow-up drawn under its parent on the board. */
export function isOnboardingBranch(
  catalog: IntakeCatalog,
  key: string,
  order: readonly string[],
): boolean {
  const parent = onboardingParentOf(catalog, key);
  return parent !== null && order.includes(parent);
}

/** The screens of a movable order that are not follow-ups: the board's own cards. */
export function onboardingRoots(
  catalog: IntakeCatalog,
  order: readonly string[],
): readonly string[] {
  return order.filter((key) => !isOnboardingBranch(catalog, key, order));
}

/** The condition of any Onboarding step: a team screen's, or an app follow-up's as ids. */
export function onboardingConditionOf(catalog: IntakeCatalog, key: string): ScreenCondition | null {
  if (isDetailScreen(key)) return appBranchCondition(catalog, detailBranch(key));
  const id = customStepId(key);
  return catalog.screens.find((screen) => screen.id === id)?.showWhen ?? null;
}

// Forms the team created ----------------------------------------------------------------------------

/** The screen of the form holding a screen's question; null for none. */
export function formScreenParent(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  screen: Pick<CustomFormScreen, 'showWhen'>,
): string | null {
  if (screen.showWhen === undefined || catalog.layout === undefined) return null;
  const fieldId = screen.showWhen.fieldId;
  const placement = catalog.layout.placements.find(
    (each) =>
      each.fieldId === fieldId &&
      each.surface === 'custom_form' &&
      form.screens.some((candidate) => candidate.id === each.screenKey),
  );
  return placement?.screenKey ?? null;
}

/** A form's screens in her order: each follow-up right after its parent. */
export function formScreensInOrder<Screen extends CustomFormScreen>(
  catalog: IntakeCatalog,
  form: { readonly screens: readonly Screen[] },
): readonly Screen[] {
  const byId = new Map<string, Screen>(form.screens.map((screen) => [screen.id, screen]));
  return branchesAfterParents(
    form.screens.map((screen) => screen.id),
    (id) => {
      const screen = byId.get(id);
      return screen === undefined ? null : formScreenParent(catalog, form, screen);
    },
  ).flatMap((id): Screen[] => {
    const screen = byId.get(id);
    return screen === undefined ? [] : [screen];
  });
}

/**
 * The conditions her answers must meet for a form's screen to open, its own
 * and every screen's above it; null when it, or one above it, is hidden.
 */
export function formOpensWhen(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  screen: CustomFormScreen,
): readonly ScreenCondition[] | null {
  const conditions: ScreenCondition[] = [];
  let current: CustomFormScreen | undefined = screen;
  for (let depth = 0; current !== undefined && depth < 64; depth += 1) {
    if (current.isHidden === true) return null;
    if (current.showWhen === undefined) return conditions;
    conditions.push(current.showWhen);
    const parent = formScreenParent(catalog, form, current);
    if (parent === null) return conditions;
    current = form.screens.find((each) => each.id === parent);
  }
  return current === undefined ? conditions : null;
}

/** The follow-ups of a form's screen, in her order. */
export function formBranchIds(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  id: string,
): readonly string[] {
  return formScreensInOrder(catalog, form)
    .filter((screen) => formScreenParent(catalog, form, screen) === id)
    .map((screen) => screen.id);
}

/** A form's screen family, flat and numbered like Onboarding's. */
export function formFamily(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  root: string,
  rootNumber: string,
) {
  return familyNumbers(root, rootNumber, (id) => formBranchIds(catalog, form, id));
}

/** The top of a form screen's family. */
export function formRootOf(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  id: string,
): string {
  let current = id;
  for (let depth = 0; depth < 64; depth += 1) {
    const screen = form.screens.find((each) => each.id === current);
    const parent = screen === undefined ? null : formScreenParent(catalog, form, screen);
    if (parent === null) return current;
    current = parent;
  }
  return current;
}

/** The screens of a form she is shown for her answers so far, in her order. */
export function openFormScreens<Screen extends CustomFormScreen>(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  screens: readonly Screen[],
  answers: Readonly<Record<string, unknown>>,
): readonly Screen[] {
  return screens.filter((screen: Screen) => {
    const conditions = formOpensWhen(catalog, form, screen);
    return conditions !== null && conditionsHold(conditions, answers);
  });
}
