import { WizardFrame } from '@/components/onboarding/wizard-frame';
import {
  EMPTY_SEASON_ANSWERS,
  SeasonAnswerFields,
  type SeasonAnswers,
} from '@/components/profile/season-answer-fields';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useBuiltinWording, useWizardStep } from '@/lib/onboarding-intake-context';
import {
  mergeSeasonDraft,
  referringEntityForAdditionalSupport,
  SEASON_SCREEN_TITLE_KEYS,
} from '@/lib/season-draft';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WIZARD_SCREEN_QUESTIONS, type SeasonWizardScreen } from '@ramassa/shared/intake';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { seasonAnswerFields } from '@ramassa/shared/schemas';

/** Focused season screens share persistence, layout, wording and entrance behavior. */
export function SeasonWizardStep({ screen }: { readonly screen: SeasonWizardScreen }) {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep(screen);
  const router = useRouter();
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
    onboardingDraftStore.saveDraft(
      mergeSeasonDraft(
        onboardingDraftStore.loadDraft(),
        screen,
        {
          applicantStatus: answers.applicantStatus ?? undefined,
          supportingEntities: answers.supportingEntities,
          childcareNeed: answers.childcareNeed ?? undefined,
          specificNeeds: answers.specificNeeds,
        },
        currentStep,
      ),
    );
  }

  return (
    <WizardFrame
      screenId={screen}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t(SEASON_SCREEN_TITLE_KEYS[screen])}
      continueLabel={t('continueAction')}
      onContinue={() => {
        if (screen === 'season' && answers.applicantStatus === 'other') {
          persist('applicant-status-details');
          const route =
            `/onboarding/applicant-status-details${step.isEditing ? '?edit=1' : ''}` as Href;
          if (step.isEditing) router.replace(route);
          else router.push(route);
          return;
        }
        persist(step.nextDraftStep);
        step.goNext();
      }}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? screen);
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
        shows={(question) =>
          WIZARD_SCREEN_QUESTIONS[screen].includes(question) && step.shouldAsk(question)
        }
        applicantStatusPresentation="picker"
        referenceEntity={referringEntityForAdditionalSupport(draft)}
        wording={wording}
      />
    </WizardFrame>
  );
}
