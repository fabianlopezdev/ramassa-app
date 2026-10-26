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
 * words. A catalog that could not load has no layout: no Ramassà field.
 *
 * A screen with a signature block (RAPP-690) always shows: she signs it only
 * when she finishes, so it is never answered before, and it shows even when
 * no field is left on it.
 */
import {
  customStepKey,
  WIZARD_QUESTION_SCREENS,
  wizardFlowOrder,
  type CustomWizardScreen,
  type IntakeQuestion,
  type QuestionScreen,
  type WizardQuestionScreen,
} from '../onboarding/intake';
import { SYSTEM_FIELD_QUESTIONS } from '../onboarding/system-fields';
import { isAskedGenerically, questionsOffTheirControl } from './app-controls';
import {
  isScreenAnswered,
  questionFromField,
  questionOfField,
  withCustomAsking,
  wizardFlow,
  type CustomAnswers,
  type CustomQuestion,
  type IntakeCatalog,
  type IntakeScreen,
} from './builder';
import { hasSignatureBlocks } from './form-blocks';
import {
  fieldById,
  fieldsOfSection,
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
    ...questionFromField(field, placement),
    label: wording.label,
    help: wording.help,
  };
}

/**
 * The fields placed on a surface (and screen) that the generic renderer asks,
 * in their order, worded for it: the Ramassà fields, and the app fields whose
 * question is off its own control (RAPP-665, `app-controls.ts`).
 */
function placedQuestionsOn(
  layout: ProfileLayout,
  surface: ProfileSurface,
  screenKey: string | null = null,
): readonly CustomQuestion[] {
  const offTheirControl = questionsOffTheirControl(layout);
  return placementsOnSurface(layout, surface, screenKey).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    return field === undefined || !isAskedGenerically(field, offTheirControl)
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
  return catalog.layout === undefined
    ? []
    : placedQuestionsOn(catalog.layout, 'onboarding', screenKey);
}

/**
 * The app's fields an edit screen asks with the generic renderer (RAPP-666):
 * every live field of a question off its own control (`app-controls.ts`), in
 * the Fitxa's order, by the field's own name. Her own edit and the staff
 * phone's edit draw the app's controls for every other question, so a field
 * staff retyped, gave new options or moved never leaves an edit screen. A
 * reader without Sensitive gets no Sensitive field, and a question the screen
 * never asks (`notOnThisScreen`: her own edit leaves her birth date and her
 * entity to the team) stays off it.
 */
export function editScreenQuestions(
  layout: ProfileLayout,
  showSensitive: boolean,
  notOnThisScreen: ReadonlySet<IntakeQuestion> = new Set(),
): readonly CustomQuestion[] {
  const offTheirControl = questionsOffTheirControl(layout);
  return layout.sections.flatMap((section) =>
    fieldsOfSection(layout, section.id)
      .filter(
        (field) =>
          field.kind === 'builtin' &&
          isAskedGenerically(field, offTheirControl) &&
          (showSensitive || field.privacy !== 'sensitive') &&
          (field.systemKey == null ||
            !notOnThisScreen.has(SYSTEM_FIELD_QUESTIONS[field.systemKey])),
      )
      .map((field) => questionOfField(layout, field)),
  );
}

/** The fields her season re-registration asks again, in their order, worded for her. */
export function seasonFormQuestions(catalog: IntakeCatalog): readonly CustomQuestion[] {
  return catalog.layout === undefined ? [] : placedQuestionsOn(catalog.layout, 'season');
}

/** The step of the app's own order an app screen belongs to. */
export const APP_SCREEN_ANCHORS: Readonly<Record<WizardQuestionScreen, QuestionScreen>> = {
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
 * questions, and while one is unanswered that screen shows. A screen with
 * only signature blocks (RAPP-690) is a group with no field.
 */
function appScreenGroup(catalog: IntakeCatalog, screen: WizardQuestionScreen): IntakeScreen | null {
  const questions = onboardingScreenQuestions(catalog, screen);
  return questions.length === 0 && !hasSignatureBlocks(catalog.blocks, screen)
    ? null
    : {
        id: appScreenGroupId(screen),
        title: {},
        intro: null,
        afterScreen: APP_SCREEN_ANCHORS[screen],
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
    .filter((screen) => !screen.isArchived)
    .map((screen): IntakeScreen => ({
      ...screen,
      questions: onboardingScreenQuestions(catalog, screen.id),
    }));
  const onAppScreens = WIZARD_QUESTION_SCREENS.flatMap((screen) => {
    const group = appScreenGroup(catalog, screen);
    return group === null ? [] : [group];
  });
  const signs = (screen: IntakeScreen) =>
    hasSignatureBlocks(catalog.blocks, screen.builtinScreen ?? screen.id);
  // A screen with no field left to ask still shows for its signature blocks.
  const all = [...own, ...onAppScreens];
  const asked = new Map(withCustomAsking(all, asking).map((screen) => [screen.id, screen]));
  const shown = all.flatMap((screen) => {
    const kept = asked.get(screen.id);
    if (kept !== undefined) return [kept];
    return signs(screen) ? [{ ...screen, questions: [] }] : [];
  });
  const plan = shown.map((screen): CustomWizardScreen => ({
    id: screen.id,
    afterScreen: screen.afterScreen,
    isAnswered:
      !signs(screen) &&
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
