import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { onboardingDraftStore } from '@/lib/onboarding';
import { seedDraftFromProfile, WIZARD_SCREEN_DRAFT_STEP } from '@/lib/onboarding-intake';
import { WizardIntakeProvider, type WizardIntake } from '@/lib/onboarding-intake-context';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import {
  fetchDocumentStepExplanation,
  fetchMyAnsweredQuestions,
  nextWizardScreen,
} from '@ramassa/shared/intake';
import { fetchOwnProfile } from '@ramassa/shared/profile';

const hiddenHeaderScreenOptions = { headerShown: false } as const;

/**
 * Seeds the draft from what staff or an entity already answered (RAPP-300),
 * once: a draft that exists is her own work in progress and wins, and a woman
 * with no profile starts the full wizard as before.
 */
function seedWizardDraft(intake: WizardIntake): void {
  if (onboardingDraftStore.loadDraft() !== null || intake.profile === null) return;
  const firstScreen = nextWizardScreen('start', intake.answered);
  onboardingDraftStore.saveDraft({
    currentStep: WIZARD_SCREEN_DRAFT_STEP[firstScreen],
    ...seedDraftFromProfile(intake.profile, intake.answered),
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
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const { user } = useAuth();
  const intake = useQuery({
    queryKey: ['onboarding-intake', user?.id ?? 'signed-out'],
    queryFn: async ({ signal }): Promise<WizardIntake> => {
      const [profile, answered, documentExplanation] = await Promise.all([
        fetchOwnProfile(supabase, { signal }),
        fetchMyAnsweredQuestions(supabase, { signal }),
        fetchDocumentStepExplanation(supabase, { signal }),
      ]);
      return { profile, answered, documentExplanation };
    },
    enabled: user !== null,
    // Staff may change her record between two openings: always read it fresh.
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const [isSeeded, setIsSeeded] = useState(false);

  useEffect(() => {
    if (intake.data === undefined) return;
    seedWizardDraft(intake.data);
    setIsSeeded(true);
  }, [intake.data]);

  if (intake.isError) {
    return (
      <AnnouncementFeedError
        message={t('intakeLoadFailed')}
        retryLabel={t('retryAction')}
        code={toAppError(intake.error).code}
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
      <Stack screenOptions={hiddenHeaderScreenOptions} />
    </WizardIntakeProvider>
  );
}
