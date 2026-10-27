import { hasDocumentDetails } from '@/lib/documentation-step';
import { onboardingDraftStore } from '@/lib/onboarding';
/**
 * What the wizard knows before she types anything (RAPP-300): her stored
 * profile, if staff or an entity created it, and which questions are already
 * answered. Loaded once by the onboarding layout, which seeds the draft from it
 * before any screen mounts, and read by every screen through `useWizardStep`.
 */
import { isWizardStackRoute, wizardDraftStep, wizardStepRoute } from '@/lib/onboarding-intake';
import { lastSupportNeedStep } from '@/lib/support-needs-draft';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { createContext, use, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  DEFAULT_REQUIRED_QUESTIONS,
  DEFAULT_WIZARD_FLOW,
  isRequiredQuestion,
  nextWizardScreen,
  previousWizardScreen,
  questionFieldLabel,
  wizardScreenPosition,
  type AnsweredQuestions,
  type CustomWizardScreen,
  type IntakeQuestion,
  type RequiredQuestions,
  type WizardFlow,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  builtinHelp,
  builtinLabel,
  builtinOptions,
  EMPTY_INTAKE_CATALOG,
  requiredBuiltinQuestions,
  type CustomAnswers,
  type FormBlock,
  type IntakeCatalog,
  type IntakeScreen,
  type SystemFieldIndex,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraft, OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import type { LocalizedText } from '@ramassa/shared/schemas';

export interface WizardIntake {
  /** Her names when staff or an entity gave them; none for a self-started intake. */
  readonly names: { readonly firstName?: string; readonly lastName?: string };
  /**
   * Her organization's app fields by system key (RAPP-663): the app's own
   * screens read and write her answers by these field ids.
   */
  readonly fields: SystemFieldIndex;
  readonly answered: AnsweredQuestions;
  /**
   * The questions her wizard does not ask (RAPP-301): answered ones on Auto,
   * and the ones staff set to Don't ask. The planner and `shouldAsk` read
   * this; seeding and the final payload keep reading `answered`.
   */
  readonly notAsked: AnsweredQuestions;
  /** Staff's note under the document step (RAPP-302), or null when none is written. */
  readonly documentExplanation: LocalizedText | null;
  /**
   * The Fitxa fields placed on her onboarding (RAPP-307, RAPP-655): the
   * catalog, her stored answers to every field (the app's included), her
   * Ramassà screens and the groups of fields on app screens in flow order
   * (`herOnboarding`), and those screens as the planner takes them.
   */
  readonly catalog: IntakeCatalog;
  readonly customAnswers: CustomAnswers;
  readonly customScreens: readonly IntakeScreen[];
  readonly customPlan: readonly CustomWizardScreen[];
  /**
   * The screen order and hidden screens staff arranged (RAPP-612). Absent
   * means the app's own order.
   */
  readonly flow?: WizardFlow;
  /** Built-in questions staff removed: never asked, even when editing. */
  readonly hidden: ReadonlySet<IntakeQuestion>;
  /**
   * The built-in questions that need an answer (RAPP-611), from the catalog.
   * Absent means the app's own list.
   */
  readonly required?: RequiredQuestions;
  /**
   * For a test player, when staff last changed her situation (RAPP-619): a
   * draft from before it is dropped. Null or absent for everyone else.
   */
  readonly scenarioStamp?: string | null;
  /**
   * The Onboarding blocks she already signed, on the walk-in tablet (RAPP-691),
   * whose text has not changed since. They are out of `catalog.blocks`, so no
   * screen asks them again; the summary lists them as signed.
   */
  readonly signedBlocks?: readonly FormBlock[];
}

const EMPTY_INTAKE: WizardIntake = {
  names: {},
  fields: new Map(),
  answered: new Set(),
  notAsked: new Set(),
  documentExplanation: null,
  catalog: EMPTY_INTAKE_CATALOG,
  customAnswers: {},
  customScreens: [],
  customPlan: [],
  hidden: new Set(),
};

const WizardIntakeContext = createContext<WizardIntake>(EMPTY_INTAKE);

export function WizardIntakeProvider({
  intake,
  children,
}: {
  readonly intake: WizardIntake;
  readonly children: ReactNode;
}) {
  return <WizardIntakeContext value={intake}>{children}</WizardIntakeContext>;
}

export function useWizardIntake(): WizardIntake {
  return use(WizardIntakeContext);
}

export interface WizardStep {
  /** Opened from the summary to correct something: every question shows, and both ways lead back. */
  readonly isEditing: boolean;
  /** Step number and total for the progress bar, counting only what she sees. */
  readonly position: { readonly step: number; readonly total: number };
  /**
   * Whether this screen shows a question: unanswered ones, or all when editing.
   * A built-in question staff removed never shows (RAPP-307).
   */
  readonly shouldAsk: (question: IntakeQuestion) => boolean;
  /** Whether staff made a built-in question required (RAPP-611); her names and language always are. */
  readonly isRequired: (question: IntakeQuestion) => boolean;
  /** The organization's required list, for the screen's form schema. */
  readonly required: RequiredQuestions;
  /** The draft step to save before moving on, and the move itself. */
  readonly nextDraftStep: OnboardingDraftStep;
  readonly goNext: () => void;
  /** Null on the first screen she sees: there is nowhere to go back to. */
  readonly previousDraftStep: OnboardingDraftStep | null;
  readonly goBack: (() => void) | null;
  /** Whether the screen under this one is that step's: Back then pops to it (RAPP-707). */
  readonly isBelow: (step: WizardStepKey | OnboardingDraftStep) => boolean;
}

export function useWizardStep(screen: WizardStepKey): WizardStep {
  const {
    notAsked,
    customPlan,
    hidden,
    flow = DEFAULT_WIZARD_FLOW,
    required = DEFAULT_REQUIRED_QUESTIONS,
  } = useWizardIntake();
  const router = useRouter();
  const navigation = useNavigation();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditing = edit === '1';

  return useMemo<WizardStep>(() => {
    const next: WizardStepKey = isEditing
      ? 'summary'
      : nextWizardScreen(screen, notAsked, customPlan, flow);
    const previous: WizardStepKey | null = isEditing
      ? 'summary'
      : previousWizardScreen(screen, notAsked, customPlan, flow);
    const previousStep =
      previous === null || isEditing
        ? previous
        : landingStep(previous, onboardingDraftStore.loadDraft());
    // Editing from the summary goes back to that same summary, which re-reads
    // the draft on focus. Without history (a cold start mid-edit), replace.
    const isBelow = (target: WizardStepKey | OnboardingDraftStep) => {
      const state = navigation.getState();
      const below = state === undefined ? undefined : state.routes[state.index - 1];
      return below !== undefined && isWizardStackRoute(below, target);
    };
    const backToSummary = () =>
      router.canGoBack() ? router.back() : router.replace(wizardStepRoute('summary', 'back'));
    return {
      isEditing,
      position: wizardScreenPosition(screen, notAsked, customPlan, flow),
      shouldAsk: (question) => !hidden.has(question) && (isEditing || !notAsked.has(question)),
      isRequired: (question) => isRequiredQuestion(question, required),
      required,
      nextDraftStep: wizardDraftStep(next),
      goNext: isEditing ? backToSummary : () => router.push(wizardStepRoute(next)),
      previousDraftStep: previousStep === null ? null : wizardDraftStep(previousStep),
      // Back pops to the screen under this one when it is the previous step
      // (a resume pushes them, RAPP-707); otherwise it replaces this screen
      // with that step. The draft is the source of truth either way.
      goBack: isEditing
        ? backToSummary
        : previous === null
          ? null
          : () => {
              const target = previousStep ?? previous;
              if (isBelow(target)) router.back();
              else router.replace(wizardStepRoute(target, 'back'));
            },
      isBelow,
    };
  }, [notAsked, customPlan, flow, hidden, required, isEditing, router, navigation, screen]);
}

/**
 * The step Back lands on for a previous screen: its detail screen when her
 * draft opened one (the document details, the "other" status, the last
 * support need), else the screen itself.
 */
function landingStep(
  previous: WizardStepKey,
  draft: OnboardingDraft | null,
): WizardStepKey | OnboardingDraftStep {
  if (previous === 'documentation' && hasDocumentDetails(draft?.documentation?.documentType))
    return 'documentation-details';
  if (previous === 'specific-needs') return lastSupportNeedStep(draft?.season?.specificNeeds);
  if (previous === 'season' && draft?.season?.applicantStatus === 'other')
    return 'applicant-status-details';
  return previous;
}

/** The screen a detail screen goes back to, or null for a screen of the flow. */
function detailParent(step: OnboardingDraftStep): WizardStepKey | null {
  if (step === 'documentation-details') return 'documentation';
  if (step === 'applicant-status-details') return 'season';
  if (step.startsWith('needs-detail:')) return 'specific-needs';
  return null;
}

/**
 * The steps Back walks through from `step`, the first one first (RAPP-707).
 * A resumed wizard puts them under the step she resumes at, so Back and the
 * platform's back gesture reach every earlier screen she was asked, with her
 * answers. Screens the planner skips stay skipped.
 */
export function wizardBackTrail(
  step: OnboardingDraftStep,
  intake: WizardIntake,
  draft: OnboardingDraft | null,
): OnboardingDraftStep[] {
  const flow = intake.flow ?? DEFAULT_WIZARD_FLOW;
  const trail: OnboardingDraftStep[] = [];
  let current: OnboardingDraftStep = step;
  // Bounded: a flow has far fewer steps, and a bad plan must never loop.
  while (trail.length < 64) {
    const parent = detailParent(current);
    const previous =
      parent ??
      previousWizardScreen(current as WizardStepKey, intake.notAsked, intake.customPlan, flow);
    if (previous === null) break;
    const landing = wizardDraftStep(parent === null ? landingStep(previous, draft) : previous);
    if (trail.includes(landing) || landing === step) break;
    trail.unshift(landing);
    current = landing;
  }
  return trail;
}

export interface BuiltinWording {
  /** Staff wording of a built-in question in her language, or the app's own (RAPP-307). */
  readonly label: (question: IntakeQuestion, appLabel: string) => string;
  /**
   * The label on the question's own screen: as `label`, with "(optional)"
   * when the organization's required list makes it optional (pending fix 21).
   */
  readonly field: (question: IntakeQuestion, appLabel: string) => string;
  /** Staff help under a built-in question, or null when none is written. */
  readonly help: (question: IntakeQuestion) => string | null;
  /** The chip options of a built-in choice question: relabelled, hidden ones left out. */
  readonly options: <Option extends { readonly value: string; readonly label: string }>(
    question: IntakeQuestion,
    options: readonly Option[],
    keep?: string | null,
  ) => readonly Option[];
}

/** How staff reworded the built-in questions, for a catalog and her app language. */
export function useBuiltinWording(catalog?: IntakeCatalog): BuiltinWording {
  const intake = useWizardIntake();
  const { language } = useLanguage();
  const source = catalog ?? intake.catalog;
  const { t } = useTranslation('onboarding');
  return useMemo<BuiltinWording>(
    () => ({
      label: (question, appLabel) => builtinLabel(source, question, language) ?? appLabel,
      field: (question, appLabel) =>
        questionFieldLabel(
          question,
          builtinLabel(source, question, language) ?? appLabel,
          requiredBuiltinQuestions(source),
          (label) => t('optionalFieldLabel', { label }),
        ),
      help: (question) => builtinHelp(source, question, language),
      options: (question, options, keep = null) =>
        builtinOptions(source, question, options, language, keep),
    }),
    [source, language, t],
  );
}
