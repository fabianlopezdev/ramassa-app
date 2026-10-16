/**
 * What the wizard knows before she types anything (RAPP-300): her stored
 * profile, if staff or an entity created it, and which questions are already
 * answered. Loaded once by the onboarding layout, which seeds the draft from it
 * before any screen mounts, and read by every screen through `useWizardStep`.
 */
import { WIZARD_SCREEN_DRAFT_STEP, WIZARD_SCREEN_ROUTES } from '@/lib/onboarding-intake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createContext, use, useMemo, type ReactNode } from 'react';
import {
  nextWizardScreen,
  previousWizardScreen,
  wizardScreenPosition,
  type AnsweredQuestions,
  type IntakeQuestion,
  type WizardScreen,
} from '@ramassa/shared/intake';
import type { OnboardingStepName } from '@ramassa/shared/onboarding-drafts';
import type { LocalizedText, ProfileRow } from '@ramassa/shared/schemas';

export interface WizardIntake {
  /** Her stored profile, or null when she has none yet (a self-started intake). */
  readonly profile: ProfileRow | null;
  readonly answered: AnsweredQuestions;
  /** Staff's note under the document step (RAPP-302), or null when none is written. */
  readonly documentExplanation: LocalizedText | null;
}

const EMPTY_INTAKE: WizardIntake = {
  profile: null,
  answered: new Set(),
  documentExplanation: null,
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
  /** Whether this screen shows a question: unanswered ones, or all when editing. */
  readonly shouldAsk: (question: IntakeQuestion) => boolean;
  /** The draft step to save before moving on, and the move itself. */
  readonly nextDraftStep: OnboardingStepName;
  readonly goNext: () => void;
  /** Null on the first screen she sees: there is nowhere to go back to. */
  readonly previousDraftStep: OnboardingStepName | null;
  readonly goBack: (() => void) | null;
}

export function useWizardStep(screen: WizardScreen): WizardStep {
  const { answered } = useWizardIntake();
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditing = edit === '1';

  return useMemo<WizardStep>(() => {
    const next: WizardScreen = isEditing ? 'summary' : nextWizardScreen(screen, answered);
    const previous: WizardScreen | null = isEditing
      ? 'summary'
      : previousWizardScreen(screen, answered);
    // Editing from the summary goes back to that same summary, which re-reads
    // the draft on focus. Without history (a cold start mid-edit), replace.
    const backToSummary = () =>
      router.canGoBack() ? router.back() : router.replace(WIZARD_SCREEN_ROUTES.summary);
    return {
      isEditing,
      position: wizardScreenPosition(screen, answered),
      shouldAsk: (question) => isEditing || !answered.has(question),
      nextDraftStep: WIZARD_SCREEN_DRAFT_STEP[next],
      goNext: isEditing ? backToSummary : () => router.push(WIZARD_SCREEN_ROUTES[next]),
      previousDraftStep: previous === null ? null : WIZARD_SCREEN_DRAFT_STEP[previous],
      // replace, not back(): after a resume the redirect REPLACED the route, so
      // the stack may hold nothing under this screen. The draft is the source of truth.
      goBack: isEditing
        ? backToSummary
        : previous === null
          ? null
          : () => router.replace(WIZARD_SCREEN_ROUTES[previous]),
    };
  }, [answered, isEditing, router, screen]);
}
