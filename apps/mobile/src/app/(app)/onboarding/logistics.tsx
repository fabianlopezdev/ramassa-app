/**
 * Wizard step 3 — Contacte i logística (RAPP-21). The longest step, so the
 * ordering is deliberate: optional contact details first (each skippable
 * without friction), then the questions that need an answer (entity, family,
 * sizes), everything tap-first where the answers are enumerable.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { onboardingDraftStore, usePendingInviteEntity } from '@/lib/onboarding';
import { logisticsFormSchema, type LogisticsFormInput } from '@/lib/onboarding-form';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { prefilledReferenceEntity } from '@ramassa/shared/accounts';
import { CLOTHING_SIZES, SHOE_SIZES, type LogisticsStep } from '@ramassa/shared/schemas';

export default function LogisticsStepScreen() {
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());

  const saved = (draft?.logistics ?? {}) as Partial<LogisticsFormInput>;
  const invitedEntity = usePendingInviteEntity();

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LogisticsFormInput, unknown, LogisticsStep>({
    resolver: zodResolver(logisticsFormSchema),
    defaultValues: {
      phone: saved.phone ?? '',
      address: saved.address ?? '',
      city: saved.city ?? '',
      postalCode: saved.postalCode ?? '',
      referenceEntity: saved.referenceEntity ?? '',
      referenceContactName: saved.referenceContactName ?? '',
      hasDependents: saved.hasDependents ?? false,
      numDependents: saved.numDependents ?? '',
      clothingSize: saved.clothingSize ?? '',
      shoeSize: saved.shoeSize ?? '',
    },
  });

  const hasDependents = watch('hasDependents');
  const referenceEntity = watch('referenceEntity');
  const isNoEntity = referenceEntity === null;

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

  function persist(currentStep: 'documentation' | 'terms') {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      logistics: getValues(),
    });
  }

  const continueToTerms = handleSubmit(() => {
    persist('terms');
    router.push('/onboarding/terms');
  });

  return (
    <WizardFrame
      stepNumber={3}
      title={t('logisticsTitle')}
      intro={t('logisticsIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueToTerms}
      onBack={() => {
        persist('documentation');
        // replace, not back(): a resumed stack has no history (see documentation.tsx).
        router.replace('/onboarding/documentation');
      }}
    >
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <AuthTextField
            label={t('phoneLabel')}
            placeholder={t('phonePlaceholder')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.phone ? t('errorPhoneFormat') : undefined}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
        )}
      />
      <Controller
        control={control}
        name="address"
        render={({ field }) => (
          <AuthTextField
            label={t('addressLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoComplete="street-address"
          />
        )}
      />
      <View className="flex-row gap-sm">
        <View className="flex-[1.6]">
          <Controller
            control={control}
            name="city"
            render={({ field }) => (
              <AuthTextField
                label={t('cityLabel')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </View>
        <View className="flex-1">
          <Controller
            control={control}
            name="postalCode"
            render={({ field }) => (
              <AuthTextField
                label={t('postalCodeLabel')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                errorMessage={errors.postalCode ? t('errorPostalFormat') : undefined}
                keyboardType="number-pad"
                maxLength={5}
              />
            )}
          />
        </View>
      </View>

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('referenceEntityLabel')}
        </Text>
        <Controller
          control={control}
          name="referenceEntity"
          render={({ field }) => (
            <View className="gap-sm">
              <OptionChip
                label={t('referenceEntityNone')}
                isSelected={isNoEntity}
                onPress={() => field.onChange(field.value === null ? '' : null)}
              />
              {isNoEntity ? null : (
                <AuthTextField
                  // The question is already asked above the chip; repeating it
                  // as the field's label read as two separate questions.
                  label={t('referenceEntityPlaceholder')}
                  placeholder={t('referenceEntityPlaceholder')}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  errorMessage={errors.referenceEntity ? t('errorRequired') : undefined}
                />
              )}
            </View>
          )}
        />
      </View>

      {isNoEntity ? null : (
        <Controller
          control={control}
          name="referenceContactName"
          render={({ field }) => (
            <AuthTextField
              label={t('referenceContactNameLabel')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="words"
            />
          )}
        />
      )}

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('hasDependentsLabel')}
        </Text>
        <Controller
          control={control}
          name="hasDependents"
          render={({ field }) => (
            <View className="flex-row gap-sm">
              <OptionChip
                label={t('yesOption')}
                isSelected={field.value === true}
                onPress={() => field.onChange(true)}
              />
              <OptionChip
                label={t('noOption')}
                isSelected={field.value === false}
                onPress={() => field.onChange(false)}
              />
            </View>
          )}
        />
        {hasDependents ? (
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
              />
            )}
          />
        ) : null}
      </View>

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('clothingSizeLabel')}
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
        {errors.clothingSize ? (
          <Text className={`text-start text-sm text-error ${languageFontClass}`}>
            {t('errorRequired')}
          </Text>
        ) : null}
      </View>

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('shoeSizeLabel')}
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
        {errors.shoeSize ? (
          <Text className={`text-start text-sm text-error ${languageFontClass}`}>
            {t('errorRequired')}
          </Text>
        ) : null}
      </View>
    </WizardFrame>
  );
}
