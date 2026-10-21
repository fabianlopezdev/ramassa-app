import { FormTextArea } from '@/components/forms/form-text-area';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardStep } from '@/lib/onboarding-intake-context';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextStyle } from 'react-native';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { APPLICANT_STATUS_DETAILS_MAX_LENGTH } from '@ramassa/shared/schemas';

const inputStyle: TextStyle = { writingDirection: 'auto' };

export default function ApplicantStatusDetailsScreen() {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const step = useWizardStep('season');
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [details, setDetails] = useState(() =>
    typeof draft?.season?.applicantStatusDetails === 'string'
      ? draft.season.applicantStatusDetails
      : '',
  );
  if (draft?.season?.applicantStatus !== 'other') return <Redirect href="/onboarding/season" />;
  const persist = (currentStep: OnboardingDraftStep) => {
    const latest = onboardingDraftStore.loadDraft();
    onboardingDraftStore.saveDraft({
      ...latest,
      currentStep,
      season: { ...latest?.season, applicantStatusDetails: details },
    });
  };
  return (
    <WizardFrame
      screenId="applicant-status-details"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('otherSituationTitle')}
      continueLabel={t('continueAction')}
      onContinue={() => {
        persist(step.nextDraftStep);
        step.goNext();
      }}
      onBack={() => {
        persist('season');
        router.replace(
          `/onboarding/season?entrance=none${step.isEditing ? '&edit=1' : ''}` as Href,
        );
      }}
    >
      <FormTextArea
        testID="onboarding-applicant-status-details"
        label={t('otherSituationDetailsLabel')}
        value={details}
        onChangeText={setDetails}
        maxLength={APPLICANT_STATUS_DETAILS_MAX_LENGTH}
        style={inputStyle}
      />
    </WizardFrame>
  );
}
