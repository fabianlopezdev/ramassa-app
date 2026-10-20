/**
 * Wizard step 1: a warm, low-friction welcome that asks only for a name.
 * The front door also resumes an interrupted wizard from its stored step, and
 * the layout's seeding sets that step past what staff already answered (RAPP-300).
 * Staff always give both names, so this screen shows only to a woman who
 * started on her own, or when she corrects her name from the summary.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { identityNameFormSchema, type IdentityNameFormInput } from '@/lib/onboarding-form';
import { wizardStepRoute } from '@/lib/onboarding-intake';
import { useBuiltinWording, useWizardStep } from '@/lib/onboarding-intake-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export default function IdentityStepScreen() {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep('identity');
  const wording = useBuiltinWording();
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

  if (!step.isEditing && draft !== null && draft.currentStep !== 'identity') {
    return <Redirect href={wizardStepRoute(draft.currentStep)} />;
  }

  const continueToBackground = handleSubmit(
    (names) => {
      setHasSubmitErrors(false);
      onboardingDraftStore.saveDraft({
        ...draft,
        currentStep: step.nextDraftStep,
        identity: { ...(draft?.identity ?? {}), ...names },
      });
      step.goNext();
    },
    () => {
      setHasSubmitErrors(true);
      playHaptic('warning');
    },
  );

  return (
    <WizardFrame
      screenId={'identity'}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('identityTitle')}
      intro={t('identityIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToBackground}
      onBack={step.goBack ?? undefined}
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <AuthTextField
            testID="onboarding-first-name"
            label={wording.label('first_name', t('firstNameLabel'))}
            hint={wording.help('first_name')}
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
            label={wording.label('last_name', t('lastNameLabel'))}
            hint={wording.help('last_name')}
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
