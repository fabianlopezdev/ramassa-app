/**
 * A screen of the app terms at the end of her Onboarding (RAPP-772). The terms
 * are a form staff build ("Condicions de l'app"): after the summary she walks
 * its screens as the version she is shown froze them, one wizard step each,
 * with the form walker's screen (`FormWalkStep`). Her answers, ticks and
 * signatures stay in her draft on Continue and on Back.
 *
 * The last screen she is shown finishes her Onboarding: one call
 * (`complete_onboarding_signed`) makes her account and records her answers,
 * her acceptance of that version, her signatures and her consents together.
 * The terms she signs offer "Ara no", which asks first, then saves the draft
 * and signs her out; signing back in resumes here.
 *
 * Terms this build cannot read never let her through: she is asked to try
 * again.
 */

import { AnnouncementFeedError } from '@/components/announcements/feed-states';
import { FormWalkStep } from '@/components/forms/form-walker';
import { TermsDeclineAction } from '@/components/onboarding/terms-decline-action';
import { playHaptic } from '@/lib/haptics/haptics';
import { completeOnboarding, onboardingDraftStore } from '@/lib/onboarding';
import { onboardingAnswersFromDraft } from '@/lib/onboarding-answers';
import { mergedCustomAnswers, wizardStepRoute } from '@/lib/onboarding-intake';
import { useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import { termsStepKey } from '@ramassa/shared/intake';
import {
  appTermsForm,
  appTermsSubmission,
  customFormScreenQuestions,
  formScreenTextsIn,
  formWalkScreens,
  isLastFormWalkScreen,
  isTermsSignScreen,
  type FormWalkDraft,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';

export default function TermsStepRoute() {
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const { language } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refreshProfile } = useAuth();
  const intake = useWizardIntake();
  const { screenId = '' } = useLocalSearchParams<{ screenId: string }>();
  const step = useWizardStep(termsStepKey(screenId));
  const [saved] = useState(() => onboardingDraftStore.loadDraft());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const { catalog } = intake;
  const terms = catalog.terms ?? null;
  const form = appTermsForm(catalog);

  // Terms this build cannot read: she tries again, and never goes past them.
  if (terms === null || form === undefined) {
    return (
      <AnnouncementFeedError
        message={t('termsUpdateLoadFailed')}
        retryLabel={t('retryAction')}
        code="VALIDATION-1"
        languageFontClass={languageFontClass}
        isLoading={isRetrying}
        onRetry={() => {
          setIsRetrying(true);
          void queryClient
            .refetchQueries({ queryKey: ['onboarding-intake'] })
            .finally(() => setIsRetrying(false));
        }}
      />
    );
  }
  const screen = form.screens.find((candidate) => candidate.id === screenId);
  // The version changed since her draft was saved: the summary leads to the terms again.
  if (screen === undefined) return <Redirect href={wizardStepRoute('summary', 'back')} />;

  const draft: FormWalkDraft = {
    answers: mergedCustomAnswers(intake.customAnswers, saved?.custom),
    signatures: saved?.signatures ?? {},
    consents: saved?.consents ?? {},
  };
  const own = formScreenTextsIn(screen.texts, language);

  /** Her draft with what she gave on this screen. */
  function persist(currentStep: OnboardingDraftStep, next: FormWalkDraft) {
    const mine = Object.fromEntries(
      customFormScreenQuestions(catalog, screenId).flatMap((question) => {
        const value = next.answers[question.id];
        return value === undefined ? [] : [[question.id, value]];
      }),
    );
    const latest = onboardingDraftStore.loadDraft();
    onboardingDraftStore.saveDraft({
      ...latest,
      currentStep,
      custom: { ...latest?.custom, ...mine },
      signatures: { ...latest?.signatures, ...next.signatures },
      consents: { ...latest?.consents, ...next.consents },
    });
  }

  async function finish(next: FormWalkDraft) {
    if (terms === null || form === undefined) return;
    setFailureCode(null);
    setIsSubmitting(true);
    try {
      const latest = onboardingDraftStore.loadDraft();
      // Her answers as she sends them, checked (RAPP-663); a screen still
      // missing something takes her back to it.
      const built = onboardingAnswersFromDraft(latest, intake, language);
      if (!built.ok) {
        router.replace(wizardStepRoute(built.step, 'back'));
        return;
      }
      const given: FormWalkDraft = {
        answers: mergedCustomAnswers(intake.customAnswers, latest?.custom),
        signatures: latest?.signatures ?? next.signatures,
        consents: latest?.consents ?? next.consents,
      };
      const submission = appTermsSubmission({
        catalog,
        terms,
        // The terms screens her answers open: what she saw is what she sends.
        screens: formWalkScreens(catalog, form, given.answers),
        draft: given,
        language,
        device: `${Platform.OS} ${String(Platform.Version)}`,
      });
      if (submission === null) {
        setFailureCode('VALIDATION-1');
        playHaptic('warning');
        return;
      }
      const result = await completeOnboarding(
        submission.kind === 'form'
          ? built.value
          : {
              ...built.value,
              media_consent: submission.mediaConsent,
              // The version and language she was shown (RAPP-613).
              terms_version: submission.termsVersion,
              locale_shown: submission.localeShown,
            },
        submission.signing,
      );
      if (!result.ok) {
        setFailureCode(result.error.code);
        playHaptic('warning');
        return;
      }
      // The completed primary action of the whole flow (RAPP-70): the auth gate
      // swaps this stack for the tabs the moment the profile refreshes.
      playHaptic('success');
      if (user !== null) onboardingDraftStore.clearUserDraft(user.id);
      await refreshProfile();
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLastFor = (answers: FormWalkDraft['answers']) =>
    isLastFormWalkScreen(catalog, form, screenId, { ...draft.answers, ...answers });

  return (
    <FormWalkStep
      catalog={catalog}
      screen={screen}
      frameId={termsStepKey(screenId)}
      position={step.position}
      draft={draft}
      continueLabelFor={(answers) => (isLastFor(answers) ? t('finishAction') : null)}
      isSending={isSubmitting}
      failure={failureCode === null ? null : { code: failureCode, message: t('completionFailed') }}
      onBack={
        step.goBack === null
          ? undefined
          : (next) => {
              persist(step.previousDraftStep ?? termsStepKey(screenId), next);
              step.goBack?.();
            }
      }
      onContinue={(next) => {
        if (isLastFor(next.answers)) {
          persist(termsStepKey(screenId), next);
          void finish(next);
          return;
        }
        persist(step.nextDraftStep, next);
        step.goNext();
      }}
      footer={
        isTermsSignScreen(screen) ? (
          <TermsDeclineAction
            label={own.declineLabel}
            isDisabled={isSubmitting}
            onLeave={() => {
              const latest = onboardingDraftStore.loadDraft();
              if (latest !== null)
                onboardingDraftStore.saveDraft({ ...latest, currentStep: termsStepKey(screenId) });
            }}
          />
        ) : null
      }
    />
  );
}
