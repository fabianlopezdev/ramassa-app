/**
 * Her onboarding and her season form as the Fitxa's placements say (RAPP-655).
 *
 * A Ramassà field reaches her through a placement: on a Ramassà screen of her
 * onboarding, after the own questions of an app screen, or on the season
 * re-registration. Each placement says the field's order there, whether it is
 * required there, and an optional wording per language. A language without a
 * wording reads the field's own name in that language, else its Catalan name.
 *
 * Her phone plans with `herOnboarding`, the staff phone preview with
 * `onboardingScreenQuestions`, so both show the same fields with the same
 * words. A server that sends no layout (older than RAPP-649) is read through
 * the old question shape, so her app keeps working against it.
 */
import {
  customStepKey,
  WIZARD_QUESTION_SCREENS,
  wizardFlowOrder,
  type CustomWizardScreen,
  type QuestionScreen,
  type WizardQuestionScreen,
} from '../onboarding/intake';
import {
  isAskedOfHer,
  isOwnScreen,
  isScreenAnswered,
  questionFromField,
  seasonScreens,
  withCustomAsking,
  withPlacementsOf,
  wizardFlow,
  type CustomAnswers,
  type CustomQuestion,
  type IntakeCatalog,
  type IntakeScreen,
} from './builder';
import {
  fieldById,
  placementsOnSurface,
  placementWording,
  type FieldPlacement,
  type ProfileField,
  type ProfileLayout,
  type ProfileSurface,
} from './profile-layout';

/** A field as a question, worded and required as one of its placements says. */
export function placedQuestion(
  layout: ProfileLayout,
  field: ProfileField,
  placement: FieldPlacement,
): CustomQuestion {
  const wording = placementWording(placement, field);
  return {
    ...questionFromField(layout, field, placement),
    label: wording.label,
    help: wording.help,
  };
}

/** The Ramassà fields placed on a surface (and screen), in their order, worded for it. */
function placedQuestionsOn(
  layout: ProfileLayout,
  surface: ProfileSurface,
  screenKey: string | null = null,
): readonly CustomQuestion[] {
  return placementsOnSurface(layout, surface, screenKey).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    return field === undefined || field.kind !== 'custom'
      ? []
      : [placedQuestion(layout, field, placement)];
  });
}

/**
 * The Ramassà fields her onboarding asks on one screen (an app screen's key
 * or a Ramassà screen's id), in their order, worded for her.
 */
export function onboardingScreenQuestions(
  catalog: IntakeCatalog,
  screenKey: string,
): readonly CustomQuestion[] {
  if (catalog.layout !== undefined) {
    return placedQuestionsOn(catalog.layout, 'onboarding', screenKey);
  }
  // An older server: the screen's questions in the old shape (a holder for an app screen).
  const screen = catalog.screens.find(
    (each) => !each.isArchived && (each.id === screenKey || each.builtinScreen === screenKey),
  );
  return (screen?.questions ?? [])
    .map((question) => withPlacementsOf(catalog, question))
    .filter((question) => !question.isArchived && isAskedOfHer(question));
}

/** The fields her season re-registration asks again, in their order, worded for her. */
export function seasonFormQuestions(catalog: IntakeCatalog): readonly CustomQuestion[] {
  if (catalog.layout !== undefined) return placedQuestionsOn(catalog.layout, 'season');
  return seasonScreens(catalog).flatMap((screen) => screen.questions);
}

/** The step of the app's own order an app screen belongs to. */
const ANCHOR_SCREEN: Readonly<Record<WizardQuestionScreen, QuestionScreen>> = {
  identity: 'identity',
  background: 'background',
  documentation: 'documentation',
  logistics: 'logistics',
  equipment: 'logistics',
  season: 'season',
  'supporting-entities': 'season',
  'participation-support': 'season',
  'specific-needs': 'season',
};

/** The id of the group of fields placed on an app screen. */
export function appScreenGroupId(screen: WizardQuestionScreen): string {
  return `app:${screen}`;
}

/**
 * The fields placed on an app screen, as one group that names the screen. It
 * is never a step of its own: the app screen shows them after its own
 * questions, and while one is unanswered that screen shows.
 */
function appScreenGroup(catalog: IntakeCatalog, screen: WizardQuestionScreen): IntakeScreen | null {
  const questions = onboardingScreenQuestions(catalog, screen);
  return questions.length === 0
    ? null
    : {
        id: appScreenGroupId(screen),
        title: {},
        intro: null,
        afterScreen: ANCHOR_SCREEN[screen],
        isArchived: false,
        builtinScreen: screen,
        questions,
      };
}

/** The group of fields placed on an app screen, from her screens; undefined when none. */
export function appScreenFields(
  screens: readonly IntakeScreen[],
  screen: string | undefined,
): IntakeScreen | undefined {
  return screen === undefined
    ? undefined
    : screens.find((candidate) => candidate.builtinScreen === screen);
}

type PlannedScreen = {
  readonly id: string;
  readonly builtinScreen?: WizardQuestionScreen | null;
};

/** Her onboarding's Ramassà part: what her phone shows and how the planner walks it. */
export interface HerOnboarding {
  /**
   * Her Ramassà screens and the groups of fields on app screens, in the order
   * her phone walks them, each with the fields she is asked. A field set to
   * Don't ask is left out, and a screen with none left is no screen.
   */
  readonly screens: readonly IntakeScreen[];
  /** The same screens as the wizard planner takes them. */
  readonly plan: readonly CustomWizardScreen[];
}

/**
 * Her onboarding from the placements, for one player: `answers` are hers
 * (stored and the entity's), `asking` staff's choice per field (true for
 * Ask, false for Don't ask; none is Auto). On Auto a screen whose every field
 * has an answer is skipped; on Ask it shows, with the answer to confirm.
 */
export function herOnboarding(
  catalog: IntakeCatalog,
  answers: CustomAnswers = {},
  asking: ReadonlyMap<string, boolean> = new Map(),
): HerOnboarding {
  const own = catalog.screens
    .filter((screen) => !screen.isArchived && isOwnScreen(screen))
    .map((screen) => ({ ...screen, questions: onboardingScreenQuestions(catalog, screen.id) }));
  const onAppScreens = WIZARD_QUESTION_SCREENS.flatMap((screen) => {
    const group = appScreenGroup(catalog, screen);
    return group === null ? [] : [group];
  });
  const shown = withCustomAsking([...own, ...onAppScreens], asking);
  const plan = shown.map((screen): CustomWizardScreen => ({
    id: screen.id,
    afterScreen: screen.afterScreen,
    isAnswered:
      isScreenAnswered(screen, answers) &&
      !screen.questions.some((question) => asking.get(question.id) === true),
    builtinScreen: screen.builtinScreen ?? null,
  }));
  const order = wizardFlowOrder(plan, wizardFlow(catalog));
  const position = (screen: PlannedScreen) =>
    order.indexOf(screen.builtinScreen ?? customStepKey(screen.id));
  const byFlow = <Screen extends PlannedScreen>(list: readonly Screen[]) =>
    [...list].sort((a, b) => position(a) - position(b));
  return { screens: byFlow(shown), plan: byFlow(plan) };
}
