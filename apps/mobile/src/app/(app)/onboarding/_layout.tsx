import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { logger } from '@/lib/observability';
import { onboardingDraftStore } from '@/lib/onboarding';
import { draftForScenario, withSelectedLanguage, wizardDraftStep } from '@/lib/onboarding-intake';
import { WizardIntakeProvider, type WizardIntake } from '@/lib/onboarding-intake-context';
import { ScreenWordingProvider } from '@/lib/screen-wording';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { resumeStep } from '@/lib/wizard-completeness';
import { seededDraft } from '@/lib/wizard-draft';
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
  askedRequiredQuestions,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  fetchMyCustomQuestionAsking,
  herOnboarding,
  hiddenBuiltinQuestions,
  wizardFlow,
  wizardFormFields,
} from '@ramassa/shared/intake-builder';
import { fetchMyTestScenarioStamp } from '@ramassa/shared/participants';
import { fetchOwnProfile } from '@ramassa/shared/profile';
import type { LanguageCode } from '@ramassa/shared/schemas';

const hiddenHeaderScreenOptions = { headerShown: false } as const;

/**
 * Staff's Ask or Don't ask on their questions for her (RAPP-643). It never
 * blocks the wizard: without it every staff question is asked, as before, and
 * the failure is logged.
 */
function loadAsking(): Promise<ReadonlyMap<string, boolean>> {
  return fetchMyCustomQuestionAsking(supabase).catch((error: unknown) => {
    logger.warn('onboarding.asking.load_failed', { error: toAppError(error) });
    return new Map<string, boolean>();
  });
}

/**
 * Seeds the draft from what staff or an entity already answered (RAPP-300),
 * once: existing draft answers win. The app language comes from the initial
 * language picker, including when staff answers let her skip background.
 * Her draft is kept by field (RAPP-663); one from before is converted.
 */
function seedWizardDraft(intake: WizardIntake, language: LanguageCode): void {
  const firstScreen = nextWizardScreen('start', intake.notAsked, intake.customPlan, intake.flow);
  const scenarioStamp = intake.scenarioStamp ?? null;
  const stored = draftForScenario(onboardingDraftStore.loadStoredDraft(), scenarioStamp);
  const draft = withSelectedLanguage(
    stored ??
      seededDraft(intake.fields, {
        currentStep: wizardDraftStep(firstScreen),
        scenarioStamp,
        names: intake.names,
        stored: intake.customAnswers,
      }),
    language,
  );
  onboardingDraftStore.saveStoredDraft(draft);
  if (stored === null) return;
  // Staff may have moved a screen before the step she reached (RAPP-612): she
  // resumes at the first one still missing a required answer.
  const view = onboardingDraftStore.loadDraft();
  if (view === null) return;
  onboardingDraftStore.saveStoredDraft({
    ...draft,
    currentStep: resumeStep(view, {
      custom: intake.customPlan,
      flow: intake.flow ?? DEFAULT_WIZARD_FLOW,
      required: intake.required,
      customScreens: intake.customScreens,
      storedCustom: intake.customAnswers,
    }),
  });
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
      // The layout of her fields and her answers to them are needed: the app's
      // own screens read and write her answers by field (RAPP-663).
      const [
        profile,
        answered,
        toAsk,
        documentExplanation,
        catalog,
        answers,
        asking,
        scenarioStamp,
      ] = await Promise.all([
        fetchOwnProfile(supabase, { signal }),
        fetchMyAnsweredQuestions(supabase, { signal }),
        fetchMyQuestionsToAsk(supabase, { signal }),
        fetchDocumentStepExplanation(supabase, { signal }),
        fetchIntakeCatalog(supabase),
        fetchMyCustomAnswers(supabase),
        loadAsking(),
        // A test player's situation stamp (RAPP-619). It never blocks the
        // wizard: without it, her draft is kept as for anyone.
        fetchMyTestScenarioStamp(supabase).catch(() => null),
      ]);
      const hidden = hiddenBuiltinQuestions(catalog);
      // Her screens from the placements (RAPP-655): a field set to Don't ask is
      // never asked, a screen with none left is skipped (RAPP-643), and one on
      // Ask shows even when answered. The staff phone preview reads the same.
      const custom = herOnboarding(catalog, answers, asking);
      return {
        // Her names, when staff gave them (RAPP-300); they stay on her account (D2).
        names:
          profile === null
            ? {}
            : {
                ...(answered.has('first_name') ? { firstName: profile.first_name } : {}),
                ...(answered.has('last_name') ? { lastName: profile.last_name } : {}),
              },
        // The app's fields her screens' forms ask; a question off its control
        // is kept with the team's fields (RAPP-665).
        fields: wizardFormFields(catalog),
        answered,
        // A built-in question staff removed is never asked, so it never keeps a
        // screen. The staff preview of a new invitation plans with the same
        // function (RAPP-618).
        notAsked: wizardNotAsked(toAsk, hidden),
        documentExplanation,
        catalog,
        customAnswers: answers,
        customScreens: custom.screens,
        customPlan: custom.plan,
        // The order and hidden screens staff arranged (RAPP-612). The staff
        // preview of a new invitation reads the same flow.
        flow: wizardFlow(catalog),
        hidden,
        // The one required list (RAPP-611): every screen, the summary and the
        // final check read it. A question off its control is the generic
        // renderer's to require (RAPP-665).
        required: askedRequiredQuestions(catalog),
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
    onboardingDraftStore.setFields(intake.data.fields);
    seedWizardDraft(intake.data, language);
    setIsSeeded(true);
  }, [intake.data, language, user?.id]);
  useEffect(
    () => () => {
      onboardingDraftStore.setUser(null);
      onboardingDraftStore.setFields(null);
    },
    [],
  );

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
