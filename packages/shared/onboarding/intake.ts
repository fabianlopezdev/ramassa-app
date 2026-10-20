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
export type WizardQuestionScreen = QuestionScreen | 'equipment';
export type WizardScreen = WizardQuestionScreen | 'summary' | 'terms';
export const WIZARD_QUESTION_SCREENS: readonly WizardQuestionScreen[] = [
  'identity',
  'background',
  'documentation',
  'logistics',
  'equipment',
  'season',
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
};

/**
 * The `complete_onboarding` payload keys behind each question. Two-field
 * questions travel whole: a document type without its number, or a count
 * without its yes or no, means nothing on its own.
 */
export const QUESTION_PAYLOAD_KEYS: Readonly<Record<IntakeQuestion, readonly string[]>> = {
  first_name: ['first_name'],
  last_name: ['last_name'],
  date_of_birth: ['date_of_birth'],
  place_of_birth: ['place_of_birth'],
  nationality: ['nationality'],
  preferred_language: ['preferred_language'],
  document: ['document_type', 'document_number', 'document_name'],
  phone: ['phone'],
  address: ['address'],
  city: ['city'],
  postal_code: ['postal_code'],
  reference_entity: ['reference_entity'],
  reference_contact_name: ['reference_contact_name'],
  dependents: ['has_dependents', 'num_dependents'],
  clothing_size: ['clothing_size'],
  shoe_size: ['shoe_size'],
  avatar: ['avatar_url'],
  applicant_status: ['applicant_status'],
  supporting_entities: ['supporting_entities'],
  season_number: ['season_number'],
  childcare_need: ['childcare_need'],
  specific_needs: ['specific_needs'],
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

/** Every step in order, shown or not: each built-in screen with its staff screens after it. */
function fullOrder(custom: readonly CustomWizardScreen[]): WizardStepKey[] {
  return [
    ...QUESTION_SCREENS.flatMap((screen): WizardStepKey[] => [
      screen,
      ...(screen === 'logistics' ? ['equipment' as const] : []),
      ...custom
        .filter((customScreen) => customScreen.afterScreen === screen)
        .map((customScreen) => customStepKey(customScreen.id)),
    ]),
    'summary',
    'terms',
  ];
}

/** Every screen she will see, in order: the asked ones, the summary and the terms. */
function visibleScreens(
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[],
): WizardStepKey[] {
  const asked = new Set<WizardStepKey>(screensToAsk(answered));
  const answeredCustom = new Set(
    custom.filter((screen) => screen.isAnswered).map((screen) => customStepKey(screen.id)),
  );
  return fullOrder(custom).filter((step) =>
    isCustomStep(step)
      ? !answeredCustom.has(step)
      : step === 'summary' || step === 'terms' || asked.has(step),
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
): WizardStepKey;
export function nextWizardScreen(
  from: WizardStepKey | 'start',
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[] = [],
): WizardStepKey {
  const screens = visibleScreens(answered, custom);
  if (from === 'start') return screens[0] ?? 'summary';
  const index = screens.indexOf(from);
  if (index === -1) {
    // A screen she was not shown (opened from the summary to edit): the next
    // screen after it in the full order that she does see.
    const order = fullOrder(custom);
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
): WizardStepKey | null;
export function previousWizardScreen(
  from: WizardStepKey,
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[] = [],
): WizardStepKey | null {
  const screens = visibleScreens(answered, custom);
  const index = screens.indexOf(from);
  return index > 0 ? (screens[index - 1] ?? null) : null;
}

/** The step number and total for the progress indicator, counting only what she sees. */
export function wizardScreenPosition(
  screen: WizardStepKey,
  answered: AnsweredQuestions,
  custom: readonly CustomWizardScreen[] = [],
): { step: number; total: number } {
  const screens = visibleScreens(answered, custom);
  return { step: Math.max(screens.indexOf(screen), 0) + 1, total: screens.length };
}

/** Keys the server always needs, whatever was answered before. */
const ALWAYS_SENT_KEYS = ['media_consent', 'terms_version', 'locale_shown'] as const;

/**
 * The payload with only the questions that were unanswered or that she
 * changed. `complete_onboarding` keeps the stored value of every question the
 * payload leaves out, so a question she only confirmed on the summary is not
 * sent and its staff or entity record stays.
 */
export function trimPayloadToAnswers<T extends Record<string, unknown>>(
  payload: T,
  answered: AnsweredQuestions,
  stored: Readonly<Record<string, unknown>>,
): Partial<T> {
  const kept: Record<string, unknown> = {};
  for (const key of ALWAYS_SENT_KEYS) {
    if (key in payload) kept[key] = payload[key];
  }
  for (const question of INTAKE_QUESTIONS) {
    const keys = QUESTION_PAYLOAD_KEYS[question];
    const presentKeys = keys.filter((key) => key in payload);
    if (presentKeys.length === 0) continue;
    const isChanged = presentKeys.some(
      (key) => normalizeForComparison(payload[key]) !== normalizeForComparison(stored[key]),
    );
    if (!answered.has(question) || isChanged) {
      for (const key of presentKeys) kept[key] = payload[key];
    }
  }
  return kept as Partial<T>;
}

/** An empty string and a missing value are the same answer: none. */
function normalizeForComparison(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  return value;
}
