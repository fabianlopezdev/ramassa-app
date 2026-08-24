/**
 * Wizard step 2 — Documentació (RAPP-21). One decision (which document, if
 * any) and at most one field. "No en tinc" is a first-class answer that
 * completes the step by itself, and the reassurance line states who can see
 * the number and that it is stored encrypted, in the player's language.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { OnboardingQuestionHeading } from '@/components/onboarding/onboarding-question-heading';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { documentationFormSchema } from '@/lib/onboarding-form';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { DOCUMENT_TYPES, type DocumentationStep } from '@ramassa/shared/schemas';

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
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);

  const saved = (draft?.documentation ?? {}) as Partial<DocumentationStep>;
  const {
    control,
    handleSubmit,
    getValues,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(documentationFormSchema),
    defaultValues: {
      documentType: saved.documentType ?? ('nie' as const),
      documentNumber: saved.documentNumber ?? '',
    },
  });

  const selectedType = watch('documentType');

  function persist(currentStep: 'background' | 'logistics') {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      documentation: getValues(),
    });
  }

  const continueToLogistics = handleSubmit(
    () => {
      setHasSubmitErrors(false);
      persist('logistics');
      router.push('/onboarding/logistics');
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
      stepNumber={3}
      title={t('documentationTitle')}
      intro={t('documentationIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToLogistics}
      onBack={() => {
        persist('background');
        // replace, not back(): after a resume the redirect REPLACED the route,
        // so the stack has nothing under this screen and back() is a silent
        // no-op. The draft, not the nav stack, is the wizard's source of truth.
        router.replace('/onboarding/background');
      }}
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      <View className="gap-xs">
        <OnboardingQuestionHeading label={t('documentTypeLabel')} symbol={documentSymbol} />
        <Controller
          control={control}
          name="documentType"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {DOCUMENT_TYPES.map((type) => (
                <OptionChip
                  key={type}
                  label={t(DOCUMENT_TYPE_LABEL_KEYS[type])}
                  isSelected={field.value === type}
                  onPress={() => field.onChange(type)}
                />
              ))}
            </View>
          )}
        />
      </View>

      {selectedType === 'none' ? null : (
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
    </WizardFrame>
  );
}
