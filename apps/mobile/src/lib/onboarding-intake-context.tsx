import { hasDocumentDetails } from '@/lib/documentation-step';
import { onboardingDraftStore } from '@/lib/onboarding';
/**
 * What the wizard knows before she types anything (RAPP-300): her stored
 * profile, if staff or an entity created it, and which questions are already
 * answered. Loaded once by the onboarding layout, which seeds the draft from it
 * before any screen mounts, and read by every screen through `useWizardStep`.
 */
import { wizardDraftStep, wizardStepRoute } from '@/lib/onboarding-intake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createContext, use, useMemo, type ReactNode } from 'react';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  nextWizardScreen,
  previousWizardScreen,
  wizardScreenPosition,
  type AnsweredQuestions,
  type CustomWizardScreen,
  type IntakeQuestion,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  builtinHelp,
  builtinLabel,
  builtinOptions,
  EMPTY_INTAKE_CATALOG,
  type CustomAnswers,
  type IntakeCatalog,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import type { LocalizedText, ProfileRow } from '@ramassa/shared/schemas';

export interface WizardIntake {
  /** Her stored profile, or null when she has none yet (a self-started intake). */
  readonly profile: ProfileRow | null;
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
   * The staff question builder (RAPP-307): the catalog, her stored answers to
   * the staff questions, the staff screens she is asked with only their wizard
   * and season questions, and those screens as the planner takes them. An
   * empty catalog when it could not load: the wizard then runs without them.
   */
  readonly catalog: IntakeCatalog;
  readonly customAnswers: CustomAnswers;
  readonly customScreens: readonly IntakeScreen[];
  readonly customPlan: readonly CustomWizardScreen[];
  /** Built-in questions staff removed: never asked, even when editing. */
  readonly hidden: ReadonlySet<IntakeQuestion>;
}

const EMPTY_INTAKE: WizardIntake = {
  profile: null,
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
  /** The draft step to save before moving on, and the move itself. */
  readonly nextDraftStep: OnboardingDraftStep;
  readonly goNext: () => void;
  /** Null on the first screen she sees: there is nowhere to go back to. */
  readonly previousDraftStep: OnboardingDraftStep | null;
  readonly goBack: (() => void) | null;
}

export function useWizardStep(screen: WizardStepKey): WizardStep {
  const { notAsked, customPlan, hidden } = useWizardIntake();
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditing = edit === '1';

  return useMemo<WizardStep>(() => {
    const next: WizardStepKey = isEditing
      ? 'summary'
      : nextWizardScreen(screen, notAsked, customPlan);
    const previous: WizardStepKey | null = isEditing
      ? 'summary'
      : previousWizardScreen(screen, notAsked, customPlan);
    const previousStep =
      previous === 'documentation' &&
      hasDocumentDetails(onboardingDraftStore.loadDraft()?.documentation?.documentType)
        ? 'documentation-details'
        : previous;
    // Editing from the summary goes back to that same summary, which re-reads
    // the draft on focus. Without history (a cold start mid-edit), replace.
    const backToSummary = () =>
      router.canGoBack() ? router.back() : router.replace(wizardStepRoute('summary', 'back'));
    return {
      isEditing,
      position: wizardScreenPosition(screen, notAsked, customPlan),
      shouldAsk: (question) => !hidden.has(question) && (isEditing || !notAsked.has(question)),
      nextDraftStep: wizardDraftStep(next),
      goNext: isEditing ? backToSummary : () => router.push(wizardStepRoute(next)),
      previousDraftStep:
        previousStep === null
          ? null
          : previousStep === 'documentation-details'
            ? previousStep
            : wizardDraftStep(previousStep),
      // replace, not back(): after a resume the redirect REPLACED the route, so
      // the stack may hold nothing under this screen. The draft is the source of truth.
      goBack: isEditing
        ? backToSummary
        : previous === null
          ? null
          : () => router.replace(wizardStepRoute(previousStep ?? previous, 'back')),
    };
  }, [notAsked, customPlan, hidden, isEditing, router, screen]);
}

export interface BuiltinWording {
  /** Staff wording of a built-in question in her language, or the app's own (RAPP-307). */
  readonly label: (question: IntakeQuestion, appLabel: string) => string;
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
  return useMemo<BuiltinWording>(
    () => ({
      label: (question, appLabel) => builtinLabel(source, question, language) ?? appLabel,
      help: (question) => builtinHelp(source, question, language),
      options: (question, options, keep = null) =>
        builtinOptions(source, question, options, language, keep),
    }),
    [source, language],
  );
}
