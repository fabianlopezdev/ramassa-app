/**
 * Editing your own profile (RAPP-22).
 *
 * Built from the SAME controls as the intake wizard (the text field, the option
 * chip, the country picker) and validated by a schema composed from the same
 * intake fields, so a woman meets the same question in the same shape whether
 * she is answering it for the first time or correcting it a year later.
 *
 * The save is optimistic: on this audience's connection a form that freezes
 * until the server answers reads as broken. If the write fails the cache rolls
 * back and the screen says so, because the failure mode that actually hurts is
 * believing a new phone number is saved when the team cannot reach her.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import type { z } from 'zod';
import { useOwnProfile, useUpdateOwnProfile } from '@ramassa/shared/profile';
import {
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  profileEditSchema,
  profileFromRow,
  SHOE_SIZES,
  type ProfileEdit,
} from '@ramassa/shared/schemas';

type ProfileEditInput = z.input<typeof profileEditSchema>;

export default function ProfileEditScreen() {
  const { t } = useTranslation(['profile', 'onboarding']);
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const { data: profile, isLoading } = useOwnProfile();
  const update = useUpdateOwnProfile();

  const defaultValues = useMemo(
    () => (profile === null || profile === undefined ? undefined : profileFromRow(profile)),
    [profile],
  );

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
    // Three generics, not one: the schema's INPUT (what the fields hold, with
    // optional keys absent) is not its OUTPUT (what the RPC receives), and
    // collapsing them makes the resolver unassignable.
  } = useForm<ProfileEditInput, unknown, ProfileEdit>({
    resolver: zodResolver(profileEditSchema),
    // Keyed on the loaded row: the form mounts before the profile arrives, and
    // without this it would keep its empty defaults and offer to overwrite a
    // real profile with blanks.
    values: defaultValues as ProfileEditInput | undefined,
  });

  const documentType = watch('documentType');
  const hasDependents = watch('hasDependents');
  const [isBlocked, setIsBlocked] = useState(false);

  const save = handleSubmit(
    (edit) => {
      setIsBlocked(false);
      update.mutate(edit, {
        // Optimistic: leave as soon as the write is dispatched. A failure rolls
        // the cache back, so the profile she returns to shows the truth rather
        // than the edit that did not land.
        onSettled: () => router.back(),
      });
    },
    // A rejected submit has to SAY something at the button. Every field error
    // renders next to its own field, which on a form this long is usually far
    // above the fold: pressing Save and watching nothing happen is how a
    // working button reads as a broken app. Profiles created before place of
    // birth became required hit this on their very first edit.
    () => setIsBlocked(true),
  );

  if (isLoading || defaultValues === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator accessibilityLabel={t('editTitle')} />
      </View>
    );
  }

  return (
    <WizardFrame
      title={t('editTitle')}
      continueLabel={t('saveAction')}
      onContinue={() => void save()}
      isContinueBusy={update.isPending}
      onBack={() => router.back()}
    >
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:firstNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.firstName ? t('onboarding:errorRequired') : undefined}
            autoCapitalize="words"
          />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:lastNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.lastName ? t('onboarding:errorRequired') : undefined}
            autoCapitalize="words"
          />
        )}
      />
      <Controller
        control={control}
        name="placeOfBirth"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:placeOfBirthLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.placeOfBirth ? t('onboarding:errorRequired') : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="nationality"
        render={({ field }) => (
          <CountryPicker
            label={t('onboarding:nationalityLabel')}
            value={field.value}
            onChange={field.onChange}
            errorMessage={errors.nationality ? t('onboarding:errorRequired') : undefined}
          />
        )}
      />

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:documentTypeLabel')}
        </Text>
        <Controller
          control={control}
          name="documentType"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {DOCUMENT_TYPES.map((type) => (
                <OptionChip
                  key={type}
                  label={t(
                    `onboarding:documentType${type.charAt(0).toUpperCase()}${type.slice(1)}`,
                  )}
                  isSelected={field.value === type}
                  onPress={() => field.onChange(type)}
                />
              ))}
            </View>
          )}
        />
      </View>

      {documentType === 'none' ? null : (
        <Controller
          control={control}
          name="documentNumber"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:documentNumberLabel')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={
                errors.documentNumber
                  ? documentType === 'nie'
                    ? t('onboarding:errorNieFormat')
                    : t('onboarding:errorRequired')
                  : undefined
              }
              autoCapitalize="characters"
            />
          )}
        />
      )}

      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:phoneLabel')}
            placeholder={t('onboarding:phonePlaceholder')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.phone ? t('onboarding:errorPhoneFormat') : undefined}
            keyboardType="phone-pad"
          />
        )}
      />
      <Controller
        control={control}
        name="address"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:addressLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:cityLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Controller
        control={control}
        name="postalCode"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:postalCodeLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.postalCode ? t('onboarding:errorPostalFormat') : undefined}
            keyboardType="number-pad"
          />
        )}
      />

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:hasDependentsLabel')}
        </Text>
        <Controller
          control={control}
          name="hasDependents"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              <OptionChip
                label={t('onboarding:yesOption')}
                isSelected={field.value === true}
                onPress={() => field.onChange(true)}
              />
              <OptionChip
                label={t('onboarding:noOption')}
                isSelected={field.value === false}
                onPress={() => field.onChange(false)}
              />
            </View>
          )}
        />
      </View>

      {hasDependents ? (
        <Controller
          control={control}
          name="numDependents"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:numDependentsLabel')}
              value={String(field.value ?? '')}
              onChangeText={(text) => field.onChange(Number(text.replace(/\D/g, '')) || 0)}
              onBlur={field.onBlur}
              errorMessage={errors.numDependents ? t('onboarding:errorDependentsRange') : undefined}
              keyboardType="number-pad"
            />
          )}
        />
      ) : null}

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:clothingSizeLabel')}
        </Text>
        <Controller
          control={control}
          name="clothingSize"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {CLOTHING_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </View>
          )}
        />
      </View>

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:shoeSizeLabel')}
        </Text>
        <Controller
          control={control}
          name="shoeSize"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {SHOE_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </View>
          )}
        />
      </View>

      {/* The revocable consent, in both directions. The wizard told her she
          could change this from her profile; this is the control that keeps
          that promise. */}
      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:mediaConsentLabel')}
        </Text>
        <Controller
          control={control}
          name="mediaConsent"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              <OptionChip
                label={t('onboarding:yesOption')}
                isSelected={field.value === true}
                onPress={() => field.onChange(true)}
              />
              <OptionChip
                label={t('onboarding:noOption')}
                isSelected={field.value === false}
                onPress={() => field.onChange(false)}
              />
            </View>
          )}
        />
      </View>
      {/* Rendered LAST, so it sits directly above the Save button. Put at the
          top of a form this long it would be off-screen at the moment it
          matters, which is the same failure it exists to fix. */}
      {isBlocked ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('saveBlocked')}
        </Text>
      ) : null}

      {update.isError ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('saveFailed')}
        </Text>
      ) : null}
    </WizardFrame>
  );
}
