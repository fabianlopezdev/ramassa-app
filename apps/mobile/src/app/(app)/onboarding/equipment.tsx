/** Equipment sizes have their own step, with the shared wizard layout and motion. */
import { OnboardingQuestionHeading } from '@/components/onboarding/onboarding-question-heading';
import { OptionGrid } from '@/components/onboarding/option-grid';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { mergeLogisticsDraft } from '@/lib/logistics-draft';
import { onboardingDraftStore } from '@/lib/onboarding';
import {
  equipmentFormSchema,
  type EquipmentFormInput,
  type EquipmentFormValue,
} from '@/lib/onboarding-form';
import { useBuiltinWording, useWizardStep } from '@/lib/onboarding-intake-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { CLOTHING_SIZES, SHOE_SIZES } from '@ramassa/shared/schemas';

export default function EquipmentStepScreen() {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep('equipment');
  const wording = useBuiltinWording();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const saved = (draft?.logistics ?? {}) as Partial<EquipmentFormInput>;
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);
  const { control, handleSubmit, getValues } = useForm<
    EquipmentFormInput,
    unknown,
    EquipmentFormValue
  >({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: { clothingSize: saved.clothingSize ?? '', shoeSize: saved.shoeSize ?? '' },
  });
  const persist = (currentStep: OnboardingDraftStep) =>
    onboardingDraftStore.saveDraft(
      mergeLogisticsDraft(onboardingDraftStore.loadDraft(), getValues(), currentStep),
    );
  const next = handleSubmit(
    () => {
      setHasSubmitErrors(false);
      persist(step.nextDraftStep);
      step.goNext();
    },
    () => {
      setHasSubmitErrors(true);
      playHaptic('warning');
    },
  );
  return (
    <WizardFrame
      screenId="equipment"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('equipmentTitle')}
      intro={t('equipmentIntro')}
      continueLabel={t('continueAction')}
      onContinue={next}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? 'equipment');
              step.goBack?.();
            }
      }
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      {step.shouldAsk('clothing_size') ? (
        <View className="gap-xs">
          <OnboardingQuestionHeading
            label={wording.label('clothing_size', t('clothingSizeLabel'))}
          />
          <QuestionHelp text={wording.help('clothing_size')} />
          <Controller
            control={control}
            name="clothingSize"
            render={({ field }) => (
              <OptionGrid
                options={CLOTHING_SIZES}
                value={field.value}
                accessibilityHint={t('clothingSizeLabel')}
                onChange={field.onChange}
              />
            )}
          />
        </View>
      ) : null}

      {step.shouldAsk('shoe_size') ? (
        <View className="gap-xs">
          <OnboardingQuestionHeading label={wording.label('shoe_size', t('shoeSizeLabel'))} />
          <QuestionHelp text={wording.help('shoe_size')} />
          <Controller
            control={control}
            name="shoeSize"
            render={({ field }) => (
              <OptionGrid
                options={SHOE_SIZES}
                value={field.value}
                accessibilityHint={t('shoeSizeLabel')}
                onChange={field.onChange}
              />
            )}
          />
        </View>
      ) : null}
    </WizardFrame>
  );
}
