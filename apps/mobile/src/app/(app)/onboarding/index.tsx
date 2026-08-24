/**
 * Wizard step 1: a warm, low-friction welcome that asks only for a name.
 * The front door also resumes an interrupted wizard from its stored step.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { identityNameFormSchema, type IdentityNameFormInput } from '@/lib/onboarding-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export default function IdentityStepScreen() {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);

  const defaultValues = useMemo<IdentityNameFormInput>(() => {
    const saved = (draft?.identity ?? {}) as Partial<IdentityNameFormInput>;
    return {
      firstName: saved.firstName ?? '',
      lastName: saved.lastName ?? '',
    };
  }, [draft]);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<IdentityNameFormInput>({
    resolver: zodResolver(identityNameFormSchema),
    defaultValues,
  });

  if (draft !== null && draft.currentStep !== 'identity') {
    return <Redirect href={`/onboarding/${draft.currentStep}`} />;
  }

  const continueToBackground = handleSubmit(
    (names) => {
      setHasSubmitErrors(false);
      onboardingDraftStore.saveDraft({
        ...draft,
        currentStep: 'background',
        identity: { ...(draft?.identity ?? {}), ...names },
      });
      router.push('/onboarding/background');
    },
    () => {
      setHasSubmitErrors(true);
      playHaptic('warning');
    },
  );

  return (
    <WizardFrame
      stepNumber={1}
      title={t('identityTitle')}
      intro={t('identityIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToBackground}
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <AuthTextField
            testID="onboarding-first-name"
            label={t('firstNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            isInvalid={Boolean(errors.firstName)}
            autoCapitalize="words"
            autoComplete="given-name"
            returnKeyType="next"
          />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <AuthTextField
            testID="onboarding-last-name"
            label={t('lastNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            isInvalid={Boolean(errors.lastName)}
            autoCapitalize="words"
            autoComplete="family-name"
            returnKeyType="done"
            onSubmitEditing={continueToBackground}
          />
        )}
      />
    </WizardFrame>
  );
}
