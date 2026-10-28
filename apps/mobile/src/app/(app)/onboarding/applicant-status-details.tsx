import { FormTextArea } from '@/components/forms/form-text-area';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { useOwnField } from '@/lib/follow-up-screens';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardStep } from '@/lib/onboarding-intake-context';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextStyle } from 'react-native';
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
  // Asked, and required, as staff placed it on this screen (RAPP-720).
  const own = useOwnField('applicant-status-details', 'applicant_status_details');
  const [isMissing, setIsMissing] = useState(false);
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
        if (own.asking === 'required' && details.trim() === '') {
          setIsMissing(true);
          playHaptic('warning');
          return;
        }
        persist(step.nextDraftStep);
        step.goNext();
      }}
      onBack={() => {
        persist('season');
        if (step.isBelow('season')) router.back();
        else
          router.replace(
            `/onboarding/season?entrance=none${step.isEditing ? '&edit=1' : ''}` as Href,
          );
      }}
    >
      {own.asking === 'not_asked' ? null : (
        <View className="gap-sm">
          <FormTextArea
            testID="onboarding-applicant-status-details"
            label={own.label(t('otherSituationDetailsLabel'))}
            value={details}
            onChangeText={(text) => {
              setDetails(text);
              setIsMissing(false);
            }}
            errorMessage={isMissing ? t('errorRequired') : undefined}
            maxLength={APPLICANT_STATUS_DETAILS_MAX_LENGTH}
            style={inputStyle}
          />
          <QuestionHelp text={own.help} />
        </View>
      )}
    </WizardFrame>
  );
}
