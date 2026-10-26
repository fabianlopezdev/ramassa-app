/**
 * Which wizard screen still misses a required answer (RAPP-612, RAPP-611).
 *
 * Staff can reorder the screens while a woman is half way through her wizard,
 * and they choose which questions are required. Her draft then resumes at the
 * step she reached, and screens moved before it are never shown, so a required
 * answer could be missing at the summary. Each screen is judged by the same
 * form schema its Continue button uses, with the organization's required
 * list; a staff screen by its required questions. The first one in the flow
 * that does not pass is where she goes, on resume and when she confirms the
 * summary. A screen with a signature block she has not signed in her draft
 * does not pass either (RAPP-690). Pure: no React, so bun tests run it.
 */
import {
  customStepId,
  DEFAULT_REQUIRED_QUESTIONS,
  isRequiredQuestion,
  WIZARD_QUESTION_SCREENS,
  wizardFlowOrder,
  type CustomWizardScreen,
  type IntakeQuestion,
  type RequiredQuestions,
  type WizardFlow,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  appScreenFields,
  formBlocksOn,
  isCustomQuestionRequired,
  isCustomQuestionVisible,
  isEmptyAnswer,
  unsignedFormBlocks,
  type CustomAnswers,
  type FormBlock,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraft, OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { seasonAnswerFields, type SeasonAnswerFields } from '@ramassa/shared/schemas';
import {
  contactFormSchemaFor,
  documentationFormSchemaFor,
  equipmentFormSchemaFor,
  identityFormSchemaFor,
  identityNameFormSchema,
} from './onboarding-form';

type Section = Readonly<Record<string, unknown>>;

function section(value: Section | undefined): Section {
  return value ?? {};
}

type SeasonScreen = 'season' | 'supporting-entities' | 'participation-support' | 'specific-needs';

/** The season question each season screen asks, under its draft name. */
const SEASON_SCREEN_FIELD: Readonly<
  Record<SeasonScreen, readonly [keyof SeasonAnswerFields, IntakeQuestion]>
> = {
  season: ['applicantStatus', 'applicant_status'],
  'supporting-entities': ['supportingEntities', 'supporting_entities'],
  'participation-support': ['childcareNeed', 'childcare_need'],
  'specific-needs': ['specificNeeds', 'specific_needs'],
};

/** A season screen: its answers parse, and its question, if required, has one. */
function seasonScreenComplete(
  screen: SeasonScreen,
  draft: OnboardingDraft | null,
  required: RequiredQuestions,
): boolean {
  const parsed = seasonAnswerFields.safeParse(section(draft?.season));
  if (!parsed.success) return false;
  const [field, question] = SEASON_SCREEN_FIELD[screen];
  if (!isRequiredQuestion(question, required)) return true;
  const value = parsed.data[field];
  return value !== undefined && !(Array.isArray(value) && value.length === 0);
}

/** Whether a built-in screen's answers in the draft pass its Continue check. */
export function isScreenComplete(
  screen: WizardQuestionScreen,
  draft: OnboardingDraft | null,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): boolean {
  switch (screen) {
    case 'identity':
      return identityNameFormSchema.safeParse(section(draft?.identity)).success;
    case 'background':
      return identityFormSchemaFor(required).safeParse(section(draft?.identity)).success;
    case 'documentation':
      return documentationFormSchemaFor(required).safeParse(section(draft?.documentation)).success;
    case 'logistics':
      return contactFormSchemaFor(required).safeParse(section(draft?.logistics)).success;
    case 'equipment':
      return equipmentFormSchemaFor(required).safeParse(section(draft?.logistics)).success;
    default:
      return seasonScreenComplete(screen, draft, required);
  }
}

/** A staff screen misses an answer when a required question she sees has none (RAPP-611). */
function isCustomScreenComplete(screen: IntakeScreen, answers: CustomAnswers): boolean {
  return screen.questions.every(
    (question) =>
      !isCustomQuestionRequired(question) ||
      !isCustomQuestionVisible(question, answers) ||
      !isEmptyAnswer(answers[question.id]),
  );
}

function isQuestionScreen(step: WizardStepKey): step is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(step);
}

/** What the completeness check reads besides her draft. */
export interface CompletenessContext {
  readonly custom: readonly CustomWizardScreen[];
  readonly flow: WizardFlow;
  readonly required?: RequiredQuestions;
  /** Her staff screens with their questions, and her stored answers to them. */
  readonly customScreens?: readonly IntakeScreen[];
  readonly storedCustom?: CustomAnswers;
  /** The signature blocks of her Onboarding (RAPP-690): each needs her strokes. */
  readonly blocks?: readonly FormBlock[];
}

/**
 * The first step, in the flow staff arranged, whose answers do not pass its
 * check; null when every screen she must answer is complete. A screen staff
 * hid is never asked, so it never blocks her.
 */
export function firstIncompleteStep(
  draft: OnboardingDraft | null,
  context: CompletenessContext,
): WizardStepKey | null {
  const required = context.required ?? DEFAULT_REQUIRED_QUESTIONS;
  const answers: CustomAnswers = { ...context.storedCustom, ...draft?.custom };
  const isUnsigned = (screenKey: string) =>
    unsignedFormBlocks(formBlocksOn(context.blocks, 'onboarding', screenKey), draft?.signatures)
      .length > 0;
  for (const step of wizardFlowOrder(context.custom, context.flow)) {
    const customId = customStepId(step);
    if (customId !== null) {
      const screen = context.customScreens?.find((candidate) => candidate.id === customId);
      if (screen !== undefined && !isCustomScreenComplete(screen, answers)) return step;
      if (screen !== undefined && isUnsigned(customId)) return step;
      continue;
    }
    if (!isQuestionScreen(step) || context.flow.hiddenScreens.has(step)) continue;
    if (!isScreenComplete(step, draft, required)) return step;
    if (isUnsigned(step)) return step;
    // The Fitxa fields placed on this screen (RAPP-655).
    const placed = appScreenFields(context.customScreens ?? [], step);
    if (placed !== undefined && !isCustomScreenComplete(placed, answers)) return step;
  }
  return null;
}

/** The first built-in screen that misses an answer, with the app's own required list. */
export function firstIncompleteScreen(
  draft: OnboardingDraft | null,
  custom: readonly CustomWizardScreen[],
  flow: WizardFlow,
): WizardQuestionScreen | null {
  const step = firstIncompleteStep(draft, { custom, flow });
  return step !== null && isQuestionScreen(step) ? step : null;
}

/** The flow step a draft step belongs to: a detail screen counts as its question screen. */
function flowStepOf(step: OnboardingDraftStep): WizardStepKey {
  if (step === 'documentation-details') return 'documentation';
  if (step === 'applicant-status-details') return 'season';
  if (step.startsWith('needs-detail:')) return 'specific-needs';
  return step as WizardStepKey;
}

/**
 * Where an interrupted wizard resumes: the step she reached, unless a step
 * before it (staff may have moved one there since, or made a question
 * required) still misses an answer. Then she resumes at that step.
 */
export function resumeStep(
  draft: OnboardingDraft,
  context: CompletenessContext,
): OnboardingDraftStep {
  const incomplete = firstIncompleteStep(draft, context);
  if (incomplete === null) return draft.currentStep;
  const order = wizardFlowOrder(context.custom, context.flow);
  const reachedAt = order.indexOf(flowStepOf(draft.currentStep));
  // A step the flow no longer has (a removed staff screen) counts as the end.
  const position = reachedAt === -1 ? order.length : reachedAt;
  return order.indexOf(incomplete) < position ? incomplete : draft.currentStep;
}
