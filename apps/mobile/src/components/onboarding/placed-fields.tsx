/**
 * The Fitxa fields placed on an app screen (RAPP-651, RAPP-655), after the
 * screen's own questions, in their order and worded for her. The wizard frame
 * draws them on every app screen that has some, so no screen needs its own
 * code for them.
 *
 * They behave as on a Ramassà screen (RAPP-307): the same fields, the same
 * checks before she leaves (a required one included, RAPP-611), and her
 * answers kept in the draft until the terms step sends them with the others.
 * Continue checks them first and saves them before the screen's own Continue
 * runs, which reads the draft afresh; Back saves them unchecked.
 *
 * The signature blocks staff put on the screen (RAPP-690) show among them in
 * their order, each required, their strokes kept in the draft the same way.
 * So do the consents placed there (RAPP-699), their ticks kept by key.
 */

import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { useScreenConsents } from '@/components/onboarding/screen-consents';
import { useSignatureBlocks } from '@/components/onboarding/signature-blocks';
import { checkCustomAnswers } from '@/lib/custom-answer-errors';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { mergedCustomAnswers, wizardDraftStep } from '@/lib/onboarding-intake';
import { useWizardIntake } from '@/lib/onboarding-intake-context';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { WizardQuestionScreen } from '@ramassa/shared/intake';
import {
  appScreenFields,
  isCustomQuestionVisible,
  updateCustomAnswer,
} from '@ramassa/shared/intake-builder';

export interface PlacedFields {
  /** Whether the screen has any: nothing else here matters when it has none. */
  readonly hasQuestions: boolean;
  readonly fields: ReactNode;
  readonly hasErrors: boolean;
  /** A signature is being drawn (RAPP-690): the screen must not scroll under her finger. */
  readonly isDrawing: boolean;
  /** Checks them; when they pass, saves them to the draft and returns true. */
  readonly checkAndSave: () => boolean;
  /** Saves them as they are, for Back. */
  readonly save: () => void;
}

export function usePlacedFields(screenId: string | undefined): PlacedFields {
  const { t } = useTranslation('onboarding');
  const { customScreens, customAnswers } = useWizardIntake();
  const questions = appScreenFields(customScreens, screenId)?.questions ?? [];
  const [answers, setAnswers] = useState<CustomAnswerDraft>(() =>
    mergedCustomAnswers(customAnswers, onboardingDraftStore.loadDraft()?.custom),
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const signatures = useSignatureBlocks(screenId, setIsDrawing);
  const consents = useScreenConsents(screenId);
  const hasQuestions =
    questions.length > 0 || signatures.blocks.length > 0 || consents.consents.length > 0;

  function save(saved: CustomAnswerDraft = answers) {
    if (!hasQuestions) return;
    const mine = Object.fromEntries(
      questions.flatMap((question) => {
        const value = saved[question.id];
        return value === undefined ? [] : [[question.id, value]];
      }),
    );
    const latest = onboardingDraftStore.loadDraft();
    onboardingDraftStore.saveDraft({
      ...latest,
      // The screen's own Continue or Back sets the step next.
      currentStep: latest?.currentStep ?? wizardDraftStep(screenId as WizardQuestionScreen),
      custom: { ...latest?.custom, ...mine },
      signatures: signatures.drafted(latest?.signatures),
      consents: consents.drafted(latest?.consents),
    });
  }

  function checkAndSave(): boolean {
    if (!hasQuestions) return true;
    // The shared schema checks each answer, as the database will (RAPP-610).
    const checked = checkCustomAnswers(questions, answers, t);
    setAnswers(checked.answers);
    setErrors(checked.errors);
    const isSigned = signatures.check();
    const isTicked = consents.check();
    if (Object.keys(checked.errors).length > 0 || !isSigned || !isTicked) {
      playHaptic('warning');
      return false;
    }
    save(checked.answers);
    return true;
  }

  const fields = !hasQuestions ? null : (
    <View testID={`wizard-added-${String(screenId)}`} className="gap-lg">
      {signatures.interleave(
        questions.filter((question) => isCustomQuestionVisible(question, answers)),
        (question) => (
          <CustomQuestionField
            key={question.id}
            question={question}
            value={answers[question.id]}
            errorMessage={errors[question.id]}
            onChange={(value) => {
              setAnswers((current) => updateCustomAnswer(questions, current, question.id, value));
              if (errors[question.id] !== undefined) {
                setErrors((current) =>
                  Object.fromEntries(Object.entries(current).filter(([id]) => id !== question.id)),
                );
              }
            }}
          />
        ),
        consents.entries,
      )}
    </View>
  );

  return {
    hasQuestions,
    fields,
    hasErrors: Object.keys(errors).length > 0 || signatures.hasErrors || consents.hasErrors,
    isDrawing,
    checkAndSave,
    save: () => save(),
  };
}
