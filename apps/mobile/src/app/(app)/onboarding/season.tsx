/**
 * The registration questions (RAPP-306): applicant status, other entities that
 * support her, childcare during training and specific needs. Every one is
 * optional, and a question staff or her entity already answered is not asked
 * again (RAPP-300), unless staff chose to ask it (RAPP-301).
 */

import { WizardFrame } from '@/components/onboarding/wizard-frame';
import {
  EMPTY_SEASON_ANSWERS,
  SeasonAnswerFields,
  type SeasonAnswers,
} from '@/components/profile/season-answer-fields';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useBuiltinWording, useWizardStep } from '@/lib/onboarding-intake-context';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { seasonAnswerFields } from '@ramassa/shared/schemas';

export default function SeasonStepScreen() {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep('season');
  const wording = useBuiltinWording();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [answers, setAnswers] = useState<SeasonAnswers>(() => {
    const saved = seasonAnswerFields.safeParse(draft?.season ?? {});
    if (!saved.success) return EMPTY_SEASON_ANSWERS;
    return {
      applicantStatus: saved.data.applicantStatus ?? null,
      supportingEntities: saved.data.supportingEntities ?? [],
      seasonNumber: null,
      childcareNeed: saved.data.childcareNeed ?? null,
      specificNeeds: saved.data.specificNeeds ?? '',
    };
  });

  function persist(currentStep: OnboardingDraftStep) {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      season: {
        applicantStatus: answers.applicantStatus ?? undefined,
        supportingEntities: answers.supportingEntities,
        childcareNeed: answers.childcareNeed ?? undefined,
        specificNeeds: answers.specificNeeds,
      },
    });
  }

  return (
    <WizardFrame
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('seasonSectionTitle')}
      intro={t('seasonStepIntro')}
      continueLabel={t('continueAction')}
      onContinue={() => {
        persist(step.nextDraftStep);
        step.goNext();
      }}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? 'season');
              step.goBack?.();
            }
      }
    >
      <SeasonAnswerFields
        testIDPrefix="onboarding"
        value={answers}
        onChange={(patch) => setAnswers((current) => ({ ...current, ...patch }))}
        // Her own wizard: she sees her own sensitive answers. Partner entity
        // names are not offered to her; she types the ones that support her.
        entityNames={[]}
        showSensitive
        shows={step.shouldAsk}
        wording={wording}
      />
    </WizardFrame>
  );
}
