/**
 * A Ramassà screen of her onboarding (RAPP-307): it sits where staff put it in
 * her flow, one topic per screen like the others, and asks the Fitxa fields
 * placed on it, in their order, worded and required as each placement says
 * (RAPP-655). A screen she already answered completely is skipped (RAPP-300),
 * unless staff set a field to Ask or she opens it from the summary to correct it.
 *
 * Her answers stay in the draft until the terms step sends them, and so do
 * her strokes on the screen's signature blocks, which show among the fields in
 * their order, each required (RAPP-690), and her ticks of the screen's
 * consents (RAPP-699).
 */

import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { useScreenConsents } from '@/components/onboarding/screen-consents';
import { useSignatureBlocks } from '@/components/onboarding/signature-blocks';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { checkCustomAnswers } from '@/lib/custom-answer-errors';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { mergedCustomAnswers, WIZARD_SCREEN_ROUTES } from '@/lib/onboarding-intake';
import { useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import { teamTextIn } from '@ramassa/shared/i18n/localized-content';
import { customStepKey } from '@ramassa/shared/intake';
import { isCustomQuestionVisible, updateCustomAnswer } from '@ramassa/shared/intake-builder';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';

export default function CustomStepScreen() {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const { screenId = '' } = useLocalSearchParams<{ screenId: string }>();
  const { customScreens, customAnswers } = useWizardIntake();
  const step = useWizardStep(customStepKey(screenId));
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [answers, setAnswers] = useState<CustomAnswerDraft>(() =>
    mergedCustomAnswers(customAnswers, draft?.custom),
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const signatures = useSignatureBlocks(screenId, setIsDrawing);
  const consents = useScreenConsents(screenId);
  const screen = customScreens.find((candidate) => candidate.id === screenId);

  // Staff removed the screen since her draft was saved: the summary shows the rest.
  if (screen === undefined) return <Redirect href={WIZARD_SCREEN_ROUTES.summary} />;

  function persist(currentStep: OnboardingDraftStep, saved: CustomAnswerDraft = answers) {
    if (screen === undefined) return;
    const mine = Object.fromEntries(
      screen.questions.flatMap((question) => {
        const value = saved[question.id];
        return value === undefined ? [] : [[question.id, value]];
      }),
    );
    const latest = onboardingDraftStore.loadDraft();
    onboardingDraftStore.saveDraft({
      ...latest,
      currentStep,
      custom: { ...latest?.custom, ...mine },
      signatures: signatures.drafted(latest?.signatures),
      consents: consents.drafted(latest?.consents),
    });
  }

  // One rule with the admin (RAPP-710): a language never written follows the Catalan.
  const intro = teamTextIn(screen.intro, language, true);

  return (
    <WizardFrame
      screenId={customStepKey(screenId)}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={teamTextIn(screen.title, language, false)}
      intro={intro === '' ? undefined : intro}
      scrollEnabled={!isDrawing}
      continueLabel={t('continueAction')}
      onContinue={() => {
        // The shared schema checks each answer before she leaves the screen,
        // as the database will (RAPP-610); a phone or an email is tidied first.
        const checked = checkCustomAnswers(screen.questions, answers, t);
        setAnswers(checked.answers);
        setErrors(checked.errors);
        const isSigned = signatures.check();
        const isTicked = consents.check();
        if (Object.keys(checked.errors).length > 0 || !isSigned || !isTicked) {
          playHaptic('warning');
          return;
        }
        persist(step.nextDraftStep, checked.answers);
        step.goNext();
      }}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? customStepKey(screen.id));
              step.goBack?.();
            }
      }
    >
      <WizardValidationSummary
        isVisible={Object.keys(errors).length > 0 || signatures.hasErrors || consents.hasErrors}
        message={t('errorSummary')}
      />
      <View testID={`wizard-custom-${screen.id}`} className="gap-lg">
        {signatures.interleave(
          screen.questions.filter((question) => isCustomQuestionVisible(question, answers)),
          (question) => (
            <CustomQuestionField
              key={question.id}
              question={question}
              value={answers[question.id]}
              errorMessage={errors[question.id]}
              onChange={(value) => {
                setAnswers((current) =>
                  updateCustomAnswer(screen.questions, current, question.id, value),
                );
                if (errors[question.id] !== undefined) {
                  setErrors((current) =>
                    Object.fromEntries(
                      Object.entries(current).filter(([id]) => id !== question.id),
                    ),
                  );
                }
              }}
            />
          ),
          consents.entries,
        )}
      </View>
    </WizardFrame>
  );
}
