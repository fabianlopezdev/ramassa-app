/**
 * Wizard step 2: background details, separated from the welcome so the first
 * screen remains an easy micro-commitment. The complete identity schema still
 * validates the merged name and background record before continuing.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import {
  birthDateErrorKey,
  identityFormSchema,
  type BirthDateField,
  type IdentityFormInput,
} from '@/lib/onboarding-form';
import { useBuiltinWording, useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Text, useWindowDimensions, View } from 'react-native';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import type { IdentityStep, LanguageCode } from '@ramassa/shared/schemas';

const YEAR_FIELD_WIDTH_CLASS = 'flex-[1.4]';
const LARGE_TEXT_STACK_THRESHOLD = 1.5;
const queuedAnnouncement = { queue: true } as const;
export default function BackgroundStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const step = useWizardStep('background');
  const wording = useBuiltinWording();
  const { fontScale } = useWindowDimensions();
  const isLargeText = fontScale >= LARGE_TEXT_STACK_THRESHOLD;
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);

  const defaultValues = useMemo<IdentityFormInput>(() => {
    const saved = (draft?.identity ?? {}) as Partial<IdentityFormInput>;
    return {
      firstName: saved.firstName ?? '',
      lastName: saved.lastName ?? '',
      day: saved.day ?? '',
      month: saved.month ?? '',
      year: saved.year ?? '',
      placeOfBirth: saved.placeOfBirth ?? '',
      nationality: saved.nationality ?? '',
      preferredLanguage: saved.preferredLanguage ?? (i18n.resolvedLanguage as LanguageCode) ?? 'ca',
    };
  }, [draft, i18n.resolvedLanguage]);

  const {
    control,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<IdentityFormInput, unknown, IdentityStep>({
    resolver: zodResolver(identityFormSchema),
    defaultValues,
    mode: 'onBlur',
  });

  function persist(currentStep: OnboardingDraftStep) {
    const latest = onboardingDraftStore.loadDraft();
    const values = getValues();
    onboardingDraftStore.saveDraft({
      ...latest,
      currentStep,
      identity: {
        ...latest?.identity,
        day: values.day,
        month: values.month,
        year: values.year,
        placeOfBirth: values.placeOfBirth,
        nationality: values.nationality,
        preferredLanguage: values.preferredLanguage,
      },
    });
  }

  const continueToDocumentation = handleSubmit(
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

  const dateMessages = (['day', 'month', 'year'] as const).map((field) => {
    const key = birthDateErrorKey(field, errors[field]?.message);
    return { field, message: key === undefined ? undefined : t(key) };
  });
  const messageFor = (field: BirthDateField) =>
    dateMessages.find((error) => error.field === field)?.message;
  const dateErrorMessage = dateMessages
    .map((error) => error.message)
    .filter(Boolean)
    .join(' ');
  useEffect(() => {
    if (dateErrorMessage && process.env.EXPO_OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(dateErrorMessage, queuedAnnouncement);
    }
  }, [dateErrorMessage]);

  return (
    <WizardFrame
      screenId={'background'}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('backgroundTitle')}
      continueLabel={t('continueAction')}
      onContinue={continueToDocumentation}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? 'background');
              step.goBack?.();
            }
      }
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      {step.shouldAsk('date_of_birth') ? (
        <View className="gap-xs">
          <Text
            className={`text-start text-form font-medium text-neutral-800 ${languageFontClass}`}
          >
            {wording.label('date_of_birth', t('dateOfBirthLabel'))}
          </Text>
          <QuestionHelp text={wording.help('date_of_birth')} />
          <View className={isLargeText ? 'gap-sm' : 'flex-row gap-sm'}>
            <View className={isLargeText ? '' : 'flex-1'}>
              <Controller
                control={control}
                name="day"
                render={({ field }) => (
                  <AuthTextField
                    testID="onboarding-day"
                    label={t('dayLabel')}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={() => {
                      field.onBlur();
                      if (getValues('day') && getValues('month') && getValues('year')) {
                        void trigger(['day', 'month', 'year']);
                      }
                    }}
                    isInvalid={Boolean(errors.day)}
                    accessibilityHint={messageFor('day')}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                )}
              />
            </View>
            <View className={isLargeText ? '' : 'flex-1'}>
              <Controller
                control={control}
                name="month"
                render={({ field }) => (
                  <AuthTextField
                    testID="onboarding-month"
                    label={t('monthLabel')}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={() => {
                      field.onBlur();
                      if (getValues('day') && getValues('month') && getValues('year')) {
                        void trigger(['day', 'month', 'year']);
                      }
                    }}
                    isInvalid={Boolean(errors.month)}
                    accessibilityHint={messageFor('month')}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                )}
              />
            </View>
            <View className={isLargeText ? '' : YEAR_FIELD_WIDTH_CLASS}>
              <Controller
                control={control}
                name="year"
                render={({ field }) => (
                  <AuthTextField
                    testID="onboarding-year"
                    label={t('yearLabel')}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={() => {
                      field.onBlur();
                      if (getValues('day') && getValues('month') && getValues('year')) {
                        void trigger(['day', 'month', 'year']);
                      }
                    }}
                    isInvalid={Boolean(errors.year)}
                    accessibilityHint={messageFor('year')}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                )}
              />
            </View>
          </View>
          <View accessibilityLiveRegion="polite" className="gap-xs">
            {dateMessages.map(({ field, message }) =>
              message === undefined ? null : (
                <Text
                  selectable
                  key={field}
                  className={`text-start text-form text-error ${languageFontClass}`}
                >
                  {message}
                </Text>
              ),
            )}
          </View>
        </View>
      ) : null}

      {step.shouldAsk('place_of_birth') ? (
        <Controller
          control={control}
          name="placeOfBirth"
          render={({ field }) => (
            <AuthTextField
              testID="onboarding-place-of-birth"
              label={wording.label('place_of_birth', t('placeOfBirthLabel'))}
              hint={wording.help('place_of_birth')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              isInvalid={Boolean(errors.placeOfBirth)}
            />
          )}
        />
      ) : null}
      {step.shouldAsk('nationality') ? (
        <View className="gap-xs">
          <Controller
            control={control}
            name="nationality"
            render={({ field }) => (
              <CountryPicker
                label={wording.label('nationality', t('nationalityLabel'))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <QuestionHelp text={wording.help('nationality')} />
        </View>
      ) : null}
    </WizardFrame>
  );
}
