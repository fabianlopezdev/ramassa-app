/**
 * Wizard step 2 — Documentació (RAPP-21). One decision (which document, if
 * any) and at most one field. "No en tinc" is a first-class answer that
 * completes the step by itself, and the reassurance line states who can see
 * the number and that it is stored encrypted, in the player's language.
 *
 * The whole step is optional (RAPP-302). Entities often hold back documents to
 * protect the women, so she can skip it and the type stays empty, which is
 * different from "No en tinc". Staff can write a note under the intro on why
 * Ramassà asks; with none written, nothing extra shows.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OnboardingQuestionHeading } from '@/components/onboarding/onboarding-question-heading';
import { OptionChip } from '@/components/onboarding/option-chip';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { documentationFormSchema } from '@/lib/onboarding-form';
import { useBuiltinWording, useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { documentExplanationFor } from '@ramassa/shared/intake';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { DOCUMENT_TYPES, type DocumentationStep, type LanguageCode } from '@ramassa/shared/schemas';

const DOCUMENT_TYPE_LABEL_KEYS = {
  nie: 'documentTypeNie',
  passport: 'documentTypePassport',
  other: 'documentTypeOther',
  none: 'documentTypeNone',
} as const;
const documentSymbol: SymbolViewProps['name'] = {
  ios: 'doc.text.fill',
  android: 'description',
  web: 'description',
};

export default function DocumentationStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const step = useWizardStep('documentation');
  const wording = useBuiltinWording();
  const { documentExplanation } = useWizardIntake();
  const explanation = documentExplanationFor(
    documentExplanation,
    (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca',
  );
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);

  const saved = (draft?.documentation ?? {}) as Partial<DocumentationStep>;
  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(documentationFormSchema),
    defaultValues: {
      // Nothing chosen until she chooses: a preselected type would turn a
      // skipped step into an answer she never gave.
      documentType: saved.documentType,
      documentNumber: saved.documentNumber ?? '',
    },
  });

  const selectedType = watch('documentType');

  function persist(currentStep: OnboardingDraftStep) {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      documentation: getValues(),
    });
  }

  // Skipping stores the step empty: no type, no number.
  function skip() {
    setHasSubmitErrors(false);
    setValue('documentType', undefined);
    setValue('documentNumber', '');
    persist(step.nextDraftStep);
    step.goNext();
  }

  const continueToLogistics = handleSubmit(
    () => {
      setHasSubmitErrors(false);
      persist(step.nextDraftStep);
      step.goNext();
    },
    // One warning buzz per rejected submit, from the shared vocabulary. Same
    // placement and reasoning as step 1.
    () => {
      setHasSubmitErrors(true);
      playHaptic('warning');
    },
  );

  return (
    <WizardFrame
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('documentationTitle')}
      intro={t('documentationIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToLogistics}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? 'documentation');
              step.goBack?.();
            }
      }
    >
      {explanation === null ? null : (
        <Text
          testID="onboarding-document-explanation"
          className={`text-start text-md text-neutral-700 ${languageFontClass}`}
        >
          {explanation}
        </Text>
      )}
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      <View className="gap-xs">
        <OnboardingQuestionHeading
          label={wording.label('document', t('documentTypeLabel'))}
          symbol={documentSymbol}
        />
        <QuestionHelp text={wording.help('document')} />
        <Controller
          control={control}
          name="documentType"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {wording
                .options(
                  'document',
                  DOCUMENT_TYPES.map((type) => ({
                    value: type,
                    label: t(DOCUMENT_TYPE_LABEL_KEYS[type]),
                  })),
                  field.value ?? null,
                )
                .map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    isSelected={field.value === option.value}
                    onPress={() => field.onChange(option.value)}
                  />
                ))}
            </View>
          )}
        />
      </View>

      {selectedType === undefined || selectedType === 'none' ? null : (
        <>
          <Controller
            control={control}
            name="documentNumber"
            render={({ field }) => (
              <AuthTextField
                label={t('documentNumberLabel')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                errorMessage={
                  errors.documentNumber && field.value?.trim()
                    ? t(selectedType === 'nie' ? 'errorNieFormat' : 'errorRequired')
                    : undefined
                }
                isInvalid={Boolean(errors.documentNumber)}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            )}
          />
          <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
            {t('documentReassurance')}
          </Text>
        </>
      )}

      <PressableScale
        testID="onboarding-document-skip"
        accessibilityRole="button"
        accessibilityLabel={t('documentSkipAction')}
        onPress={skip}
        haptic="tapLight"
        className="min-h-recommended justify-center self-start rounded-md border border-primary px-md"
      >
        <Text className={`text-md font-semibold text-primary-dark ${languageFontClass}`}>
          {t('documentSkipAction')}
        </Text>
      </PressableScale>
    </WizardFrame>
  );
}
