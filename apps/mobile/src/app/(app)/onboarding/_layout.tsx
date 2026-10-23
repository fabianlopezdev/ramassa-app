import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { onboardingDraftStore } from '@/lib/onboarding';
import {
  customWizardPlan,
  draftForScenario,
  seedDraftFromProfile,
  withSelectedLanguage,
  wizardDraftStep,
} from '@/lib/onboarding-intake';
import { WizardIntakeProvider, type WizardIntake } from '@/lib/onboarding-intake-context';
import { ScreenWordingProvider } from '@/lib/screen-wording';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { resumeStep } from '@/lib/wizard-completeness';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  DEFAULT_WIZARD_FLOW,
  fetchDocumentStepExplanation,
  fetchMyAnsweredQuestions,
  fetchMyQuestionsToAsk,
  nextWizardScreen,
  wizardNotAsked,
} from '@ramassa/shared/intake';
import {
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  fetchMyCustomQuestionAsking,
  hiddenBuiltinQuestions,
  requiredBuiltinQuestions,
  withCustomAsking,
  wizardFlow,
  wizardScreens,
  type CustomAnswers,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import { fetchMyTestScenarioStamp } from '@ramassa/shared/participants';
import { fetchOwnProfile } from '@ramassa/shared/profile';
import type { LanguageCode } from '@ramassa/shared/schemas';

const hiddenHeaderScreenOptions = { headerShown: false } as const;

/**
 * The staff questions and her answers to them (RAPP-307). They never block the
 * wizard: when either fails to load, it runs with the built-in questions only,
 * as it did before staff could add their own.
 */
async function loadStaffQuestions(): Promise<{
  readonly catalog: IntakeCatalog;
  readonly answers: CustomAnswers;
  readonly asking: ReadonlyMap<string, boolean>;
}> {
  try {
    const [catalog, answers, asking] = await Promise.all([
      fetchIntakeCatalog(supabase),
      fetchMyCustomAnswers(supabase),
      // Staff's Ask or Don't ask on their questions for her (RAPP-643). Without
      // it every staff question is asked, as before.
      fetchMyCustomQuestionAsking(supabase).catch(() => new Map<string, boolean>()),
    ]);
    return { catalog, answers, asking };
  } catch {
    return { catalog: EMPTY_INTAKE_CATALOG, answers: {}, asking: new Map() };
  }
}

/**
 * Seeds the draft from what staff or an entity already answered (RAPP-300),
 * once: existing draft answers win. The app language comes from the initial
 * language picker, including when staff answers let her skip background.
 */
function seedWizardDraft(intake: WizardIntake, language: LanguageCode): void {
  const firstScreen = nextWizardScreen('start', intake.notAsked, intake.customPlan, intake.flow);
  const scenarioStamp = intake.scenarioStamp ?? null;
  const stored = draftForScenario(onboardingDraftStore.loadDraft(), scenarioStamp);
  const draft = stored ?? {
    currentStep: wizardDraftStep(firstScreen),
    ...(scenarioStamp === null ? {} : { scenarioStamp }),
    ...(intake.profile === null ? {} : seedDraftFromProfile(intake.profile, intake.answered)),
  };
  const withLanguage = withSelectedLanguage(draft, language);
  // Staff may have moved a screen before the step she reached (RAPP-612): she
  // resumes at the first one still missing a required answer.
  onboardingDraftStore.saveDraft(
    stored === null
      ? withLanguage
      : {
          ...withLanguage,
          currentStep: resumeStep(withLanguage, {
            custom: intake.customPlan,
            flow: intake.flow ?? DEFAULT_WIZARD_FLOW,
            required: intake.required,
            customScreens: intake.customScreens,
            storedCustom: intake.customAnswers,
          }),
        },
  );
}

/**
 * The wizard's own stack (RAPP-21). Native headers OFF for every step: the
 * frames render their own header (RAPP-93/94, the native one vanishes under
 * RTL on Android). Steps are pushed so the platform back gesture works, but
 * data safety never depends on it: every screen persists its draft on
 * Continue AND on Back.
 *
 * Before any step mounts, it loads what is already known about her (RAPP-300)
 * and seeds the draft, so each screen opens with staff answers in place and
 * the wizard asks only the rest.
 */
export default function OnboardingLayout() {
  const { user } = useAuth();
  return <OnboardingScreens key={user?.id} />;
}

function OnboardingScreens() {
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const { user } = useAuth();
  const { language } = useLanguage();
  const intake = useQuery({
    queryKey: ['onboarding-intake', user?.id ?? 'signed-out'],
    queryFn: async ({ signal }): Promise<WizardIntake> => {
      const [profile, answered, toAsk, documentExplanation, staffQuestions, scenarioStamp] =
        await Promise.all([
          fetchOwnProfile(supabase, { signal }),
          fetchMyAnsweredQuestions(supabase, { signal }),
          fetchMyQuestionsToAsk(supabase, { signal }),
          fetchDocumentStepExplanation(supabase, { signal }),
          loadStaffQuestions(),
          // A test player's situation stamp (RAPP-619). It never blocks the
          // wizard: without it, her draft is kept as for anyone.
          fetchMyTestScenarioStamp(supabase).catch(() => null),
        ]);
      const { catalog, answers, asking } = staffQuestions;
      const hidden = hiddenBuiltinQuestions(catalog);
      // A staff question set to Don't ask is never asked; a screen with none
      // left is skipped (RAPP-643).
      const customScreens = withCustomAsking(wizardScreens(catalog), asking);
      const asked = new Set(
        [...asking].flatMap(([questionId, isAsked]) => (isAsked ? [questionId] : [])),
      );
      return {
        profile,
        answered,
        // A built-in question staff removed is never asked, so it never keeps a
        // screen. The staff preview of a new invitation plans with the same
        // function (RAPP-618).
        notAsked: wizardNotAsked(toAsk, hidden),
        documentExplanation,
        catalog,
        customAnswers: answers,
        customScreens,
        customPlan: customWizardPlan(customScreens, answers, asked),
        // The order and hidden screens staff arranged (RAPP-612). The staff
        // preview of a new invitation reads the same flow.
        flow: wizardFlow(catalog),
        hidden,
        // The one required list (RAPP-611): every screen, the summary and the
        // final check read it.
        required: requiredBuiltinQuestions(catalog),
        scenarioStamp,
      };
    },
    enabled: user !== null,
    // Staff may change her record between two openings: always read it fresh.
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const [isSeeded, setIsSeeded] = useState(false);

  useEffect(() => {
    if (intake.data === undefined || user === null) return;
    onboardingDraftStore.setUser(user.id);
    seedWizardDraft(intake.data, language);
    setIsSeeded(true);
  }, [intake.data, language, user?.id]);
  useEffect(() => () => onboardingDraftStore.setUser(null), []);

  const isPaused = intake.data === undefined && intake.fetchStatus === 'paused';
  if (intake.data === undefined && (intake.isError || isPaused)) {
    return (
      <AnnouncementFeedError
        message={isPaused ? t(getErrorMessageKey('NETWORK-1')) : t('intakeLoadFailed')}
        retryLabel={t('retryAction')}
        code={isPaused ? 'NETWORK-1' : toAppError(intake.error).code}
        languageFontClass={languageFontClass}
        onRetry={() => void intake.refetch()}
        isLoading={intake.isFetching}
      />
    );
  }

  if (intake.data === undefined || !isSeeded) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('intakeLoading')} />;
  }

  return (
    <WizardIntakeProvider intake={intake.data}>
      {/* Staff wording of the built-in screens (RAPP-612), read by every frame. */}
      <ScreenWordingProvider catalog={intake.data.catalog} language={language}>
        <Stack screenOptions={hiddenHeaderScreenOptions} />
      </ScreenWordingProvider>
    </WizardIntakeProvider>
  );
}
