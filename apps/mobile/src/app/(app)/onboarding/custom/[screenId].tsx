/**
 * A screen of questions staff added in the question builder (RAPP-307). It
 * sits right after the built-in step staff chose, one topic per screen like
 * the others, and asks only its questions for her wizard or for this season.
 * Every question is optional. A screen she already answered completely is
 * skipped (RAPP-300), unless she opens it from the summary to correct it.
 *
 * Her answers stay in the draft until the terms step sends them.
 */

import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { onboardingDraftStore } from '@/lib/onboarding';
import { mergedCustomAnswers, WIZARD_SCREEN_ROUTES } from '@/lib/onboarding-intake';
import { useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import { customStepKey } from '@ramassa/shared/intake';
import { textIn } from '@ramassa/shared/intake-builder';
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
  const screen = customScreens.find((candidate) => candidate.id === screenId);

  // Staff removed the screen since her draft was saved: the summary shows the rest.
  if (screen === undefined) return <Redirect href={WIZARD_SCREEN_ROUTES.summary} />;

  function persist(currentStep: OnboardingDraftStep) {
    if (screen === undefined) return;
    const mine = Object.fromEntries(
      screen.questions.flatMap((question) => {
        const value = answers[question.id];
        return value === undefined ? [] : [[question.id, value]];
      }),
    );
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      custom: { ...draft?.custom, ...mine },
    });
  }

  const intro = textIn(screen.intro, language);

  return (
    <WizardFrame
      screenId={customStepKey(screenId)}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={textIn(screen.title, language)}
      intro={intro === '' ? undefined : intro}
      continueLabel={t('continueAction')}
      onContinue={() => {
        persist(step.nextDraftStep);
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
      <View testID={`wizard-custom-${screen.id}`} className="gap-lg">
        {screen.questions.map((question) => (
          <CustomQuestionField
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          />
        ))}
      </View>
    </WizardFrame>
  );
}
