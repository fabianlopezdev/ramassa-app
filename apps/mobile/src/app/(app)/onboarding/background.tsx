/**
 * Wizard step 2: background details, separated from the welcome so the first
 * screen remains an easy micro-commitment. The complete identity schema still
 * validates the merged name and background record before continuing.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { OnboardingQuestionHeading } from '@/components/onboarding/onboarding-question-heading';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { identityFormSchema, type IdentityFormInput } from '@/lib/onboarding-form';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, useLanguage } from '@ramassa/shared/i18n';
import type { IdentityStep, LanguageCode } from '@ramassa/shared/schemas';

const YEAR_FIELD_WIDTH_CLASS = 'flex-[1.4]';
const LARGE_TEXT_STACK_THRESHOLD = 1.5;
const languageSymbol: SymbolViewProps['name'] = {
  ios: 'globe',
  android: 'language',
  web: 'language',
};
const nationalitySymbol: SymbolViewProps['name'] = {
  ios: 'globe.europe.africa.fill',
  android: 'public',
  web: 'public',
};

export default function BackgroundStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const { setLanguage } = useLanguage();
  const router = useRouter();
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
    formState: { errors },
  } = useForm<IdentityFormInput, unknown, IdentityStep>({
    resolver: zodResolver(identityFormSchema),
    defaultValues,
  });

  function persist(currentStep: 'identity' | 'documentation') {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      identity: getValues(),
    });
  }

  const continueToDocumentation = handleSubmit(
    () => {
      setHasSubmitErrors(false);
      persist('documentation');
      router.push('/onboarding/documentation');
    },
    () => {
      setHasSubmitErrors(true);
      playHaptic('warning');
    },
  );

  const hasEnteredDate = Boolean(
    getValues('day').trim() || getValues('month').trim() || getValues('year').trim(),
  );
  const dateErrorKey = !hasEnteredDate
    ? null
    : errors.year?.message === 'too young'
      ? 'errorTooYoung'
      : errors.day || errors.month || errors.year
        ? errors.year?.message === 'invalid date'
          ? 'errorInvalidDate'
          : 'errorRequired'
        : null;

  return (
    <WizardFrame
      stepNumber={2}
      title={t('backgroundTitle')}
      intro={t('backgroundIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToDocumentation}
      onBack={() => {
        persist('identity');
        router.replace('/onboarding');
      }}
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('dateOfBirthLabel')}
        </Text>
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
                  onBlur={field.onBlur}
                  isInvalid={Boolean(errors.day)}
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
                  onBlur={field.onBlur}
                  isInvalid={Boolean(errors.month)}
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
                  onBlur={field.onBlur}
                  isInvalid={Boolean(errors.year)}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              )}
            />
          </View>
        </View>
        {dateErrorKey === null ? null : (
          <Text
            accessibilityLiveRegion="polite"
            className={`text-start text-sm text-error ${languageFontClass}`}
          >
            {t(dateErrorKey)}
          </Text>
        )}
      </View>

      <Controller
        control={control}
        name="placeOfBirth"
        render={({ field }) => (
          <AuthTextField
            testID="onboarding-place-of-birth"
            label={t('placeOfBirthLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            isInvalid={Boolean(errors.placeOfBirth)}
          />
        )}
      />
      <Controller
        control={control}
        name="nationality"
        render={({ field }) => (
          <CountryPicker
            label={t('nationalityLabel')}
            symbol={nationalitySymbol}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <View className="gap-xs">
        <OnboardingQuestionHeading label={t('preferredLanguageLabel')} symbol={languageSymbol} />
        <Controller
          control={control}
          name="preferredLanguage"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {SUPPORTED_LANGUAGES.map((code) => (
                <OptionChip
                  key={code}
                  label={LANGUAGE_NATIVE_NAMES[code]}
                  isSelected={field.value === code}
                  onPress={() => {
                    field.onChange(code);
                    void setLanguage(code);
                  }}
                />
              ))}
            </View>
          )}
        />
      </View>
    </WizardFrame>
  );
}
