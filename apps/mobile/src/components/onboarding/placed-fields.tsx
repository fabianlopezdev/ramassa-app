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
 */

import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
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
  /** A signature is being drawn (a consent she signs): the screen must not scroll under her finger. */
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

  function save(saved: CustomAnswerDraft = answers) {
    if (questions.length === 0) return;
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
    });
  }

  function checkAndSave(): boolean {
    if (questions.length === 0) return true;
    // The shared schema checks each answer, as the database will (RAPP-610).
    const checked = checkCustomAnswers(questions, answers, t);
    setAnswers(checked.answers);
    setErrors(checked.errors);
    if (Object.keys(checked.errors).length > 0) {
      playHaptic('warning');
      return false;
    }
    save(checked.answers);
    return true;
  }

  const fields =
    questions.length === 0 ? null : (
      <View testID={`wizard-added-${String(screenId)}`} className="gap-lg">
        {questions
          .filter((question) => isCustomQuestionVisible(question, answers))
          .map((question) => (
            <CustomQuestionField
              key={question.id}
              question={question}
              value={answers[question.id]}
              errorMessage={errors[question.id]}
              onDrawingChange={setIsDrawing}
              onChange={(value) => {
                setAnswers((current) => updateCustomAnswer(questions, current, question.id, value));
                if (errors[question.id] !== undefined) {
                  setErrors((current) =>
                    Object.fromEntries(
                      Object.entries(current).filter(([id]) => id !== question.id),
                    ),
                  );
                }
              }}
            />
          ))}
      </View>
    );

  return {
    hasQuestions: questions.length > 0,
    fields,
    hasErrors: Object.keys(errors).length > 0,
    isDrawing,
    checkAndSave,
    save: () => save(),
  };
}
