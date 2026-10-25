/**
 * The intake questions and how the wizard walks them (RAPP-300).
 *
 * Staff or a partner entity may answer part of a woman's intake before her
 * first login. `public.profile_answers` records which questions somebody
 * really answered, because profile defaults (no dependants, Catalan) look like
 * answers. The wizard then asks only the rest, shows a summary of everything,
 * and sends only what is new or changed, so a stored value is never replaced
 * by something she was not asked.
 *
 * `INTAKE_QUESTIONS` mirrors the CHECK on `profile_answers.question`; a parity
 * test reads the migration block marked `intake-questions`.
 */
import { z } from 'zod';

export const INTAKE_QUESTIONS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'place_of_birth',
  'nationality',
  'preferred_language',
  'document',
  'phone',
  'address',
  'city',
  'postal_code',
  'reference_entity',
  'reference_contact_name',
  'dependents',
  'clothing_size',
  'shoe_size',
  'avatar',
  // The season registration answers (RAPP-303): given by the entity or staff,
  // on no wizard screen yet.
  'applicant_status',
  'supporting_entities',
  'season_number',
  'childcare_need',
  'specific_needs',
] as const;
export type IntakeQuestion = (typeof INTAKE_QUESTIONS)[number];

/** The wizard screens that ask questions, in order. */
export const QUESTION_SCREENS = [
  'identity',
  'background',
  'documentation',
  'logistics',
  // The registration questions, all optional (RAPP-306).
  'season',
] as const;
export type QuestionScreen = (typeof QUESTION_SCREENS)[number];
export const SEASON_WIZARD_SCREENS = [
  'season',
  'supporting-entities',
  'participation-support',
  'specific-needs',
] as const;
export type SeasonWizardScreen = (typeof SEASON_WIZARD_SCREENS)[number];
export type WizardQuestionScreen = QuestionScreen | 'equipment' | SeasonWizardScreen;
export type WizardScreen = WizardQuestionScreen | 'summary' | 'terms-intro' | 'terms';
export const WIZARD_QUESTION_SCREENS: readonly WizardQuestionScreen[] = [
  'identity',
  'background',
  'documentation',
  'logistics',
  'equipment',
  ...SEASON_WIZARD_SCREENS,
];

/**
 * The questions each screen asks. The avatar is on no screen: the wizard does
 * not ask it, so it can never be the reason a screen shows.
 */
export const SCREEN_QUESTIONS: Readonly<Record<QuestionScreen, readonly IntakeQuestion[]>> = {
  identity: ['first_name', 'last_name'],
  background: ['date_of_birth', 'place_of_birth', 'nationality'],
  documentation: ['document'],
  logistics: [
    'phone',
    'address',
    'city',
    'postal_code',
    'reference_entity',
    'reference_contact_name',
    'dependents',
    'clothing_size',
    'shoe_size',
  ],
  season: ['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'],
};

/** Visual steps split the legacy logistics group without changing staff-screen anchors. */
export const WIZARD_SCREEN_QUESTIONS: Readonly<
  Record<WizardQuestionScreen, readonly IntakeQuestion[]>
> = {
  ...SCREEN_QUESTIONS,
  logistics: SCREEN_QUESTIONS.logistics.filter(
    (question) => question !== 'clothing_size' && question !== 'shoe_size',
  ),
  equipment: ['clothing_size', 'shoe_size'],
  season: ['applicant_status'],
  'supporting-entities': ['supporting_entities'],
  'participation-support': ['childcare_need'],
  'specific-needs': ['specific_needs'],
};

/**
 * The answered questions as the server lists them. A question this build does
 * not know (a newer server) is dropped: it cannot be asked here anyway.
 */
export const answeredQuestionsSchema = z
  .array(z.string())
  .transform((questions) =>
    questions.filter((question): question is IntakeQuestion =>
      (INTAKE_QUESTIONS as readonly string[]).includes(question),
    ),
  );

export type AnsweredQuestions = ReadonlySet<IntakeQuestion>;

export function isQuestionAnswered(answered: AnsweredQuestions, question: IntakeQuestion): boolean {
  return answered.has(question);
}

/** The question screens that still have something to ask, in order. */
export function screensToAsk(answered: AnsweredQuestions): WizardQuestionScreen[] {
  return WIZARD_QUESTION_SCREENS.filter((screen) =>
    WIZARD_SCREEN_QUESTIONS[screen].some((question) => !answered.has(question)),
  );
}

/**
 * A staff screen in the wizard (RAPP-307). It follows one built-in step and
 * shows even when that step is skipped. A screen she already answered
 * completely is skipped, as a built-in one is (RAPP-300).
 */
export interface CustomWizardScreen {
  readonly id: string;
  readonly afterScreen: QuestionScreen;
  readonly isAnswered: boolean;
  /**
   * Set for the Ramassà fields placed on an app screen (RAPP-642, RAPP-649):
   * they show on that screen, so it is never a step of its own, and while one
   * is unanswered that app screen shows.
   */
  readonly builtinScreen?: WizardQuestionScreen | null;
}

/** A staff screen of its own, a step of the wizard. */
function isOwnStep(screen: CustomWizardScreen): boolean {
  return screen.builtinScreen == null;
}

/** A wizard step: a built-in screen, or a staff screen as `custom:<id>`. */
export type CustomStepKey = `custom:${string}`;
export type WizardStepKey = WizardScreen | CustomStepKey;

const CUSTOM_STEP_PREFIX = 'custom:';

export function customStepKey(screenId: string): CustomStepKey {
  return `${CUSTOM_STEP_PREFIX}${screenId}`;
}

export function isCustomStep(step: string): step is CustomStepKey {
  return step.startsWith(CUSTOM_STEP_PREFIX);
}

/** The staff screen id of a step, or null for a built-in one. */
export function customStepId(step: string): string | null {
  return isCustomStep(step) ? step.slice(CUSTOM_STEP_PREFIX.length) : null;
}

/**
 * The screens that always end the wizard, in this order: the summary of what
 * she gave, then the terms (legal). Staff never move or hide them (RAPP-612).
 */
export const FINAL_WIZARD_SCREENS = ['summary', 'terms-intro', 'terms'] as const;

/**
 * How staff arranged the wizard (RAPP-612). `order` holds the built-in question
 * screens and staff screens as staff placed them; a step it leaves out keeps
 * its place after the step it followed in the app's own order, so an empty
 * order is today's wizard. `hiddenScreens` are built-in screens staff hid;
 * the catalog only lists ones with no required question.
 */
export interface WizardFlow {
  readonly order: readonly WizardStepKey[];
  readonly hiddenScreens: ReadonlySet<WizardQuestionScreen>;
}

export const DEFAULT_WIZARD_FLOW: WizardFlow = { order: [], hiddenScreens: new Set() };

/** The app's own order: each built-in screen with its staff screens after it. */
function defaultFlowOrder(custom: readonly CustomWizardScreen[]): WizardStepKey[] {
  return QUESTION_SCREENS.flatMap((screen): WizardStepKey[] => [
    screen,
    ...(screen === 'logistics' ? ['equipment' as const] : []),
    ...(screen === 'season' ? SEASON_WIZARD_SCREENS.slice(1) : []),
    ...custom
      .filter((customScreen) => isOwnStep(customScreen) && customScreen.afterScreen === screen)
      .map((customScreen) => customStepKey(customScreen.id)),
  ]);
}

/**
 * Every step in order, shown or not: the steps staff arranged, the ones they
 * left out after the step they followed, then the summary and the terms. A
 * step the app no longer knows (a removed staff screen) is ignored.
 */
export function wizardFlowOrder(
  custom: readonly CustomWizardScreen[],
  flow: WizardFlow = DEFAULT_WIZARD_FLOW,
): WizardStepKey[] {
  const defaults = defaultFlowOrder(custom);
  const known = new Set<WizardStepKey>(defaults);
  const placed: WizardStepKey[] = [];
  for (const step of flow.order) {
    if (known.has(step) && !placed.includes(step)) placed.push(step);
  }
  defaults.forEach((step, index) => {
    if (placed.includes(step)) return;
    const before = defaults
      .slice(0, index)
      .reverse()
      .find((earlier) => placed.includes(earlier));
    placed.splice(before === undefined ? 0 : placed.indexOf(before) + 1, 0, step);
  });
  return [...placed, ...FINAL_WIZARD_SCREENS];
}

function isHiddenScreen(step: WizardStepKey, flow: WizardFlow): boolean {
  return !isCustomStep(step) && flow.hiddenScreens.has(step as WizardQuestionScreen);
}

/** Every screen she will see, in order: the asked ones, the summary and the terms. */
function visibleScreens(
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[],
  flow: WizardFlow,
): WizardStepKey[] {
  const asked = new Set<WizardStepKey>([
    ...screensToAsk(answered),
    // An app screen with a placed field she has not answered (RAPP-642).
    ...custom.flatMap((screen) =>
      screen.builtinScreen == null || screen.isAnswered ? [] : [screen.builtinScreen],
    ),
  ]);
  const answeredCustom = new Set(
    custom.filter((screen) => screen.isAnswered).map((screen) => customStepKey(screen.id)),
  );
  const final = new Set<WizardStepKey>(FINAL_WIZARD_SCREENS);
  return wizardFlowOrder(custom, flow).filter((step) =>
    isCustomStep(step)
      ? !answeredCustom.has(step)
      : final.has(step) || (asked.has(step) && !isHiddenScreen(step, flow)),
  );
}

/**
 * Where the wizard goes after `from`; `'start'` gives the first screen. With
 * no staff screens it only ever returns a built-in one.
 */
export function nextWizardScreen(
  from: WizardScreen | 'start',
  answered: AnsweredQuestions,
): WizardScreen;
export function nextWizardScreen(
  from: WizardStepKey | 'start',
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[],
  flow?: WizardFlow,
): WizardStepKey;
export function nextWizardScreen(
  from: WizardStepKey | 'start',
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[] = [],
  flow: WizardFlow = DEFAULT_WIZARD_FLOW,
): WizardStepKey {
  const screens = visibleScreens(answered, custom, flow);
  if (from === 'start') return screens[0] ?? 'summary';
  const index = screens.indexOf(from);
  if (index === -1) {
    // A screen she was not shown (opened from the summary to edit): the next
    // screen after it in the full order that she does see.
    const order = wizardFlowOrder(custom, flow);
    return (
      order.slice(order.indexOf(from) + 1).find((screen) => screens.includes(screen)) ?? 'summary'
    );
  }
  return screens[index + 1] ?? 'terms';
}

/** The screen before `from`, or null on the first one she sees. */
export function previousWizardScreen(
  from: WizardScreen,
  answered: AnsweredQuestions,
): WizardScreen | null;
export function previousWizardScreen(
  from: WizardStepKey,
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[],
  flow?: WizardFlow,
): WizardStepKey | null;
export function previousWizardScreen(
  from: WizardStepKey,
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[] = [],
  flow: WizardFlow = DEFAULT_WIZARD_FLOW,
): WizardStepKey | null {
  const screens = visibleScreens(answered, custom, flow);
  const index = screens.indexOf(from);
  return index > 0 ? (screens[index - 1] ?? null) : null;
}

/** The step number and total for the progress indicator, counting only what she sees. */
export function wizardScreenPosition(
  screen: WizardStepKey,
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[] = [],
  flow: WizardFlow = DEFAULT_WIZARD_FLOW,
): { step: number; total: number } {
  const screens = visibleScreens(answered, custom, flow);
  return { step: Math.max(screens.indexOf(screen), 0) + 1, total: screens.length };
}
