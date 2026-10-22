/**
 * Which wizard screen still misses a required answer (RAPP-612).
 *
 * Staff can reorder the screens while a woman is half way through her wizard.
 * Her draft then resumes at the step she reached, and screens moved before it
 * are never shown, so a required answer could be missing at the summary. Each
 * screen is judged by the same form schema its Continue button uses; the
 * first one in the flow that does not pass is where she goes, on resume and
 * when she confirms the summary. Pure: no React, so bun tests run it.
 */
import {
  WIZARD_QUESTION_SCREENS,
  wizardFlowOrder,
  type CustomWizardScreen,
  type WizardFlow,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import type { OnboardingDraft, OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { seasonAnswerFields } from '@ramassa/shared/schemas';
import {
  contactFormSchema,
  documentationFormSchema,
  equipmentFormSchema,
  identityFormSchema,
  identityNameFormSchema,
} from './onboarding-form';

type Section = Readonly<Record<string, unknown>>;

/** Each screen's own check: the schema its Continue button runs, on its part of the draft. */
const SCREEN_CHECKS: Readonly<
  Record<WizardQuestionScreen, (draft: OnboardingDraft | null) => boolean>
> = {
  identity: (draft) => identityNameFormSchema.safeParse(section(draft?.identity)).success,
  background: (draft) => identityFormSchema.safeParse(section(draft?.identity)).success,
  documentation: (draft) =>
    documentationFormSchema.safeParse(section(draft?.documentation)).success,
  logistics: (draft) => contactFormSchema.safeParse(section(draft?.logistics)).success,
  equipment: (draft) => equipmentFormSchema.safeParse(section(draft?.logistics)).success,
  season: (draft) => seasonAnswerFields.safeParse(section(draft?.season)).success,
  'supporting-entities': (draft) => seasonAnswerFields.safeParse(section(draft?.season)).success,
  'participation-support': (draft) => seasonAnswerFields.safeParse(section(draft?.season)).success,
  'specific-needs': (draft) => seasonAnswerFields.safeParse(section(draft?.season)).success,
};

function section(value: Section | undefined): Section {
  return value ?? {};
}

function isQuestionScreen(step: WizardStepKey): step is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(step);
}

/** Whether a built-in screen's answers in the draft pass its Continue check. */
export function isScreenComplete(
  screen: WizardQuestionScreen,
  draft: OnboardingDraft | null,
): boolean {
  return SCREEN_CHECKS[screen](draft);
}

/**
 * The first built-in screen, in the flow staff arranged, whose answers do not
 * pass its check; null when every screen she must answer is complete. A
 * screen staff hid is never asked, so it never blocks her.
 */
export function firstIncompleteScreen(
  draft: OnboardingDraft | null,
  custom: readonly CustomWizardScreen[],
  flow: WizardFlow,
): WizardQuestionScreen | null {
  for (const step of wizardFlowOrder(custom, flow)) {
    if (!isQuestionScreen(step) || flow.hiddenScreens.has(step)) continue;
    if (!isScreenComplete(step, draft)) return step;
  }
  return null;
}

/** The flow step a draft step belongs to: a detail screen counts as its question screen. */
function flowStepOf(step: OnboardingDraftStep): WizardStepKey {
  if (step === 'documentation-details') return 'documentation';
  if (step === 'applicant-status-details') return 'season';
  if (step.startsWith('needs-detail:')) return 'specific-needs';
  return step as WizardStepKey;
}

/**
 * Where an interrupted wizard resumes: the step she reached, unless a screen
 * before it (staff may have moved one there since) still misses a required
 * answer. Then she resumes at that screen.
 */
export function resumeStep(
  draft: OnboardingDraft,
  custom: readonly CustomWizardScreen[],
  flow: WizardFlow,
): OnboardingDraftStep {
  const incomplete = firstIncompleteScreen(draft, custom, flow);
  if (incomplete === null) return draft.currentStep;
  const order = wizardFlowOrder(custom, flow);
  const reached = flowStepOf(draft.currentStep);
  const reachedAt = order.indexOf(reached);
  // A step the flow no longer has (a removed staff screen) counts as the end.
  const position = reachedAt === -1 ? order.length : reachedAt;
  return order.indexOf(incomplete) < position ? incomplete : draft.currentStep;
}
