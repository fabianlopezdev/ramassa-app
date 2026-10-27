import { AuthTextField } from '@/components/auth/auth-text-field';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { documentDetailsSchema, hasDocumentDetails } from '@/lib/documentation-step';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import type { DocumentationStep } from '@ramassa/shared/schemas';

const titleKeys = {
  nie: 'documentNieNumberTitle',
  passport: 'documentPassportNumberTitle',
  other: 'documentOtherDetailsTitle',
} as const;

export default function DocumentDetailsScreen() {
  const { t } = useTranslation('onboarding');
  const fontClass = useLanguageFontClass();
  const step = useWizardStep('documentation');
  const router = useRouter();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const saved = (draft?.documentation ?? {}) as Partial<DocumentationStep>;
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(documentDetailsSchema),
    defaultValues: {
      documentType: saved.documentType,
      documentName: saved.documentName ?? '',
      documentNumber: saved.documentNumber ?? '',
    },
    mode: 'onBlur',
  });
  const type = saved.documentType;
  if (!hasDocumentDetails(type)) return <Redirect href="/onboarding/documentation" />;
  const persist = (currentStep: typeof step.nextDraftStep) =>
    onboardingDraftStore.saveDraft({
      ...onboardingDraftStore.loadDraft(),
      currentStep,
      documentation: getValues(),
    });
  const next = handleSubmit(
    () => {
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
      screenId="documentation-details"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t(titleKeys[type])}
      continueLabel={t('continueAction')}
      onContinue={next}
      onBack={() => {
        persist('documentation');
        if (step.isBelow('documentation')) router.back();
        else
          router.replace(
            `/onboarding/documentation?entrance=none${step.isEditing ? '&edit=1' : ''}` as Href,
          );
      }}
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      {type !== 'other' ? null : (
        <Controller
          control={control}
          name="documentName"
          render={({ field }) => (
            <AuthTextField
              testID="onboarding-document-name"
              label={t('documentNameLabel')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={errors.documentName ? t('documentNameRequired') : undefined}
              maxLength={100}
              autoCapitalize="sentences"
            />
          )}
        />
      )}
      <Controller
        control={control}
        name="documentNumber"
        render={({ field }) => (
          <AuthTextField
            testID="onboarding-document-number"
            label={t('documentNumberLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={
              errors.documentNumber
                ? t(
                    type === 'nie' && field.value?.trim()
                      ? 'errorNieFormat'
                      : 'documentNumberRequired',
                  )
                : undefined
            }
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={50}
          />
        )}
      />
      <Text className={`text-start text-form text-neutral-700 ${fontClass}`}>
        {t('documentReassurance')}
      </Text>
    </WizardFrame>
  );
}
