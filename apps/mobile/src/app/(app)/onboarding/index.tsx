/**
 * Wizard step 1 — Identitat (RAPP-21). Also the wizard's front door: an
 * interrupted run re-enters here, and the stored draft's `currentStep` decides
 * whether to stay or jump forward to where the player left off.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { onboardingDraftStore } from '@/lib/onboarding';
import { identityFormSchema, type IdentityFormInput } from '@/lib/onboarding-form';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, useLanguage } from '@ramassa/shared/i18n';
import type { IdentityStep, LanguageCode } from '@ramassa/shared/schemas';

export default function IdentityStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const { setLanguage } = useLanguage();
  const router = useRouter();

  // Loaded ONCE per mount: the draft is the mount-time snapshot, the form owns
  // the values from here.
  const [draft] = useState(() => onboardingDraftStore.loadDraft());

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
      // Prefilled from the app language the player is ALREADY reading, which
      // is the strongest signal available of what she wants.
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

  // Resume: an interrupted wizard re-enters at its front door; jump to where
  // the player actually was. `identity` stays put, so back-navigation that
  // stamps `currentStep: 'identity'` cannot loop.
  if (draft !== null && draft.currentStep !== 'identity') {
    return <Redirect href={`/onboarding/${draft.currentStep}`} />;
  }

  const dateErrorKey =
    errors.year?.message === 'too young'
      ? 'errorTooYoung'
      : errors.day || errors.month || errors.year
        ? errors.year?.message === 'invalid date'
          ? 'errorInvalidDate'
          : 'errorRequired'
        : null;

  const continueToDocumentation = handleSubmit(() => {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep: 'documentation',
      identity: getValues(),
    });
    router.push('/onboarding/documentation');
  });

  return (
    <WizardFrame
      stepNumber={1}
      title={t('identityTitle')}
      intro={t('identityIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToDocumentation}
    >
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <AuthTextField
            label={t('firstNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.firstName ? t('errorRequired') : undefined}
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
            label={t('lastNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.lastName ? t('errorRequired') : undefined}
            autoCapitalize="words"
            autoComplete="family-name"
            returnKeyType="next"
          />
        )}
      />

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('dateOfBirthLabel')}
        </Text>
        <View className="flex-row gap-sm">
          <View className="flex-1">
            <Controller
              control={control}
              name="day"
              render={({ field }) => (
                <AuthTextField
                  label={t('dayLabel')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              )}
            />
          </View>
          <View className="flex-1">
            <Controller
              control={control}
              name="month"
              render={({ field }) => (
                <AuthTextField
                  label={t('monthLabel')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              )}
            />
          </View>
          <View className="flex-[1.4]">
            <Controller
              control={control}
              name="year"
              render={({ field }) => (
                <AuthTextField
                  label={t('yearLabel')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
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
            label={t('placeOfBirthLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.placeOfBirth ? t('errorRequired') : undefined}
          />
        )}
      />
      {/* A PICKER, not free text (RAPP-4 contract): nationality feeds
          aggregate reporting, and a typo is a new reporting bucket. The stored
          value is the canonical Catalan name from the shared list, identical
          from every locale. */}
      <Controller
        control={control}
        name="nationality"
        render={({ field }) => (
          <CountryPicker
            label={t('nationalityLabel')}
            value={field.value}
            onChange={field.onChange}
            errorMessage={errors.nationality ? t('errorRequired') : undefined}
          />
        )}
      />

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('preferredLanguageLabel')}
        </Text>
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
                    // The app switches WITH the choice: a player picking
                    // العربية must not finish the wizard in English. Text
                    // flips immediately; the RTL layout flip lands on the
                    // next start, which the resume path makes lossless.
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
