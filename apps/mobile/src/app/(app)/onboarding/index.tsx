/**
 * Wizard step 1: she checks her name and surname (RAPP-708). The app is
 * invitation only and every way to create a player needs both names, so they
 * open filled in, and every player sees this screen first to confirm or
 * correct them. The front door also resumes an interrupted wizard from its
 * stored step, and the layout's seeding sets that step past what staff
 * already answered (RAPP-300).
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { identityNameFormSchema, type IdentityNameFormInput } from '@/lib/onboarding-form';
import { wizardStackRoute, wizardStepRoute, type WizardStackRoute } from '@/lib/onboarding-intake';
import {
  useBuiltinWording,
  useWizardIntake,
  useWizardStep,
  wizardBackTrail,
} from '@/lib/onboarding-intake-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

/**
 * The onboarding stack, as the resume rebuilds it. A RESET must carry the
 * whole state (`stale: false`, its key and route names): a partial one is
 * ignored by the navigator and the wizard stayed blank (RAPP-707).
 */
interface WizardStackState {
  readonly key: string;
  readonly routeNames: readonly string[];
  readonly [field: string]: unknown;
}
interface WizardStackNavigation {
  getState(): WizardStackState | undefined;
  reset(
    state: WizardStackState & { stale: false; index: number; routes: WizardStackRoute[] },
  ): void;
}

export default function IdentityStepScreen() {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep('identity');
  const wording = useBuiltinWording();
  const intake = useWizardIntake();
  const navigation = useNavigation<WizardStackNavigation>();
  const router = useRouter();
  const { entrance } = useLocalSearchParams<{ entrance?: string }>();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);
  // The front door resumes at her stored step. A screen Back reaches here
  // (`entrance=none`) is identity itself, under the step she resumed at.
  const resumeAt =
    !step.isEditing && entrance !== 'none' && draft !== null && draft.currentStep !== 'identity'
      ? draft.currentStep
      : null;

  // The earlier screens she was asked go under the step she resumes at, so
  // Back and the back gesture reach each one with her answers (RAPP-707).
  // Without a stack to rebuild, or a step it does not know, she resumes
  // alone on her step as before.
  useEffect(() => {
    if (resumeAt === null) return;
    const steps = [...wizardBackTrail(resumeAt, intake, draft), resumeAt];
    const routes = steps.map((item, index) =>
      wizardStackRoute(item, index < steps.length - 1 ? 'back' : 'forward'),
    );
    const state = navigation.getState();
    if (state === undefined || routes.some((route) => !state.routeNames.includes(route.name))) {
      router.replace(wizardStepRoute(resumeAt));
      return;
    }
    navigation.reset({ ...state, stale: false, index: routes.length - 1, routes });
    // Once, on mount: the draft and the intake are read as they stood.
  }, []);

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

  if (resumeAt !== null) return null;

  const continueToBackground = handleSubmit(
    (names) => {
      setHasSubmitErrors(false);
      const latest = onboardingDraftStore.loadDraft();
      onboardingDraftStore.saveDraft({
        ...latest,
        currentStep: step.nextDraftStep,
        identity: { ...latest?.identity, ...names },
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
