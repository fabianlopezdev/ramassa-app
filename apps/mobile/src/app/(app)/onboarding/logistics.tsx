/** Contact and dependants, separate from equipment sizing. */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { MunicipalityPicker } from '@/components/onboarding/municipality-picker';
import { OnboardingQuestionHeading } from '@/components/onboarding/onboarding-question-heading';
import { OptionChip } from '@/components/onboarding/option-chip';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { mergeLogisticsDraft } from '@/lib/logistics-draft';
import { onboardingDraftStore, usePendingInviteEntity } from '@/lib/onboarding';
import {
  contactFormSchema,
  type ContactFormInput,
  type ContactFormValue,
} from '@/lib/onboarding-form';
import { useBuiltinWording, useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { prefilledReferenceEntity } from '@ramassa/shared/accounts';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';

export default function LogisticsStepScreen() {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep('logistics');
  // Shown with the entity after Yes, unless staff removed it (RAPP-618).
  const isContactRemoved = useWizardIntake().hidden.has('reference_contact_name');
  const wording = useBuiltinWording();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);

  const saved = (draft?.logistics ?? {}) as Partial<ContactFormInput>;
  const invitedEntity = usePendingInviteEntity();

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ContactFormInput, unknown, ContactFormValue>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      phone: saved.phone ?? '',
      address: saved.address ?? '',
      city: saved.city ?? '',
      postalCode: saved.postalCode ?? '',
      referenceEntity: saved.referenceEntity === null ? null : (saved.referenceEntity ?? ''),
      hasReferenceEntity: saved.hasReferenceEntity ?? null,
      referenceContactName:
        saved.referenceEntity === null ? '' : (saved.referenceContactName ?? ''),
      hasDependents: saved.hasDependents ?? false,
      numDependents: saved.numDependents ?? '',
    },
  });

  const hasDependents = watch('hasDependents');
  const hasReferenceEntity = watch('hasReferenceEntity');

  /**
   * The entity a staff invitation carries, applied ONCE and only into a field
   * she has not answered (RAPP-25). It is a DEFAULT she can change, never a
   * fact recorded about her: `prefilledReferenceEntity` owns that precedence,
   * and the ref makes sure a late-arriving lookup cannot re-apply itself over
   * something she typed in the meantime.
   */
  const hasAppliedInvite = useRef(false);
  useEffect(() => {
    if (hasAppliedInvite.current || invitedEntity === null) return;
    const next = prefilledReferenceEntity(getValues('referenceEntity'), invitedEntity);
    hasAppliedInvite.current = true;
    if (next !== getValues('referenceEntity')) {
      setValue('referenceEntity', next ?? '');
    }
  }, [invitedEntity, getValues, setValue]);

  function persist(currentStep: OnboardingDraftStep) {
    onboardingDraftStore.saveDraft(
      mergeLogisticsDraft(onboardingDraftStore.loadDraft(), getValues(), currentStep),
    );
  }

  const continueToNextStep = handleSubmit(
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
      screenId={'logistics'}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('logisticsTitle')}
      intro={t('logisticsIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToNextStep}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? 'logistics');
              step.goBack?.();
            }
      }
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      {step.shouldAsk('phone') ? (
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <AuthTextField
              label={wording.label('phone', t('phoneLabel'))}
              hint={wording.help('phone')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={errors.phone ? t('errorPhoneFormat') : undefined}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          )}
        />
      ) : null}
      {step.shouldAsk('address') ? (
        <Controller
          control={control}
          name="address"
          render={({ field }) => (
            <AuthTextField
              label={wording.label('address', t('addressLabel'))}
              hint={wording.help('address')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoComplete="street-address"
            />
          )}
        />
      ) : null}
      {step.shouldAsk('city') ? (
        <Controller
          control={control}
          name="city"
          render={({ field }) => (
            <MunicipalityPicker
              label={wording.label('city', t('cityLabel'))}
              value={field.value ?? ''}
              onChange={field.onChange}
              errorMessage={errors.city ? t('errorMunicipalityInvalid') : undefined}
            />
          )}
        />
      ) : null}
      {step.shouldAsk('postal_code') ? (
        <Controller
          control={control}
          name="postalCode"
          render={({ field }) => (
            <AuthTextField
              label={wording.label('postal_code', t('postalCodeLabel'))}
              hint={wording.help('postal_code')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={errors.postalCode ? t('errorPostalFormat') : undefined}
              keyboardType="number-pad"
              maxLength={5}
              inputWidth="medium"
            />
          )}
        />
      ) : null}

      {step.shouldAsk('reference_entity') ? (
        <View className="gap-xs">
          <OnboardingQuestionHeading label={t('referenceEntitySupportQuestion')} />
          <QuestionHelp text={wording.help('reference_entity')} />
          <Controller
            control={control}
            name="hasReferenceEntity"
            render={({ field }) => (
              <View
                className="flex-row gap-sm"
                accessibilityRole="radiogroup"
                accessibilityLabel={t('referenceEntitySupportQuestion')}
              >
                <View className="flex-1">
                  <OptionChip
                    accessibilityRole="radio"
                    label={t('yesOption')}
                    accessibilityHint={t('referenceEntitySupportQuestion')}
                    isSelected={field.value === true}
                    onPress={() => {
                      field.onChange(true);
                      if (getValues('referenceEntity') === null) setValue('referenceEntity', '');
                    }}
                  />
                </View>
                <View className="flex-1">
                  <OptionChip
                    accessibilityRole="radio"
                    label={t('noOption')}
                    accessibilityHint={t('referenceEntitySupportQuestion')}
                    isSelected={field.value === false}
                    onPress={() => {
                      field.onChange(false);
                      setValue('referenceEntity', null, { shouldValidate: true });
                      setValue('referenceContactName', '');
                    }}
                  />
                </View>
              </View>
            )}
          />
          {hasReferenceEntity === true ? (
            <Controller
              control={control}
              name="referenceEntity"
              render={({ field }) => (
                <AuthTextField
                  label={wording.label('reference_entity', t('referenceEntityPlaceholder'))}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  errorMessage={errors.referenceEntity ? t('referenceEntityRequired') : undefined}
                />
              )}
            />
          ) : null}
        </View>
      ) : null}

      {isContactRemoved ||
      hasReferenceEntity === false ||
      (step.shouldAsk('reference_entity') && hasReferenceEntity !== true) ||
      !(step.shouldAsk('reference_entity') || step.shouldAsk('reference_contact_name')) ? null : (
        <Controller
          control={control}
          name="referenceContactName"
          render={({ field }) => (
            <AuthTextField
              label={wording.label('reference_contact_name', t('referenceContactNameLabel'))}
              hint={wording.help('reference_contact_name')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="words"
            />
          )}
        />
      )}

      {step.shouldAsk('dependents') ? (
        <View className="gap-xs">
          <OnboardingQuestionHeading label={wording.label('dependents', t('hasDependentsLabel'))} />
          <QuestionHelp text={wording.help('dependents')} />
          <Controller
            control={control}
            name="hasDependents"
            render={({ field }) => (
              <View className="flex-row gap-sm">
                <View className="flex-1">
                  <OptionChip
                    label={t('yesOption')}
                    accessibilityHint={t('hasDependentsLabel')}
                    isSelected={field.value === true}
                    onPress={() => field.onChange(true)}
                  />
                </View>
                <View className="flex-1">
                  <OptionChip
                    label={t('noOption')}
                    accessibilityHint={t('hasDependentsLabel')}
                    isSelected={field.value === false}
                    onPress={() => field.onChange(false)}
                  />
                </View>
              </View>
            )}
          />
          {hasDependents ? (
            <View className="pt-lg">
              <Controller
                control={control}
                name="numDependents"
                render={({ field }) => (
                  <AuthTextField
                    label={t('numDependentsLabel')}
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    errorMessage={errors.numDependents ? t('errorDependentsRange') : undefined}
                    keyboardType="number-pad"
                    maxLength={2}
                    inputWidth="short"
                  />
                )}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </WizardFrame>
  );
}
