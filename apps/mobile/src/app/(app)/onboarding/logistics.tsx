/**
 * Wizard step 3 — Contacte i logística (RAPP-21). The longest step, so the
 * ordering is deliberate: optional contact details first (each skippable
 * without friction), then the questions that need an answer (entity, family,
 * sizes), everything tap-first where the answers are enumerable.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { MunicipalityPicker } from '@/components/onboarding/municipality-picker';
import { OnboardingQuestionHeading } from '@/components/onboarding/onboarding-question-heading';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore, usePendingInviteEntity } from '@/lib/onboarding';
import { logisticsFormSchema, type LogisticsFormInput } from '@/lib/onboarding-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { prefilledReferenceEntity } from '@ramassa/shared/accounts';
import { CLOTHING_SIZES, SHOE_SIZES, type LogisticsStep } from '@ramassa/shared/schemas';

const entitySymbol: SymbolViewProps['name'] = {
  ios: 'building.2.fill',
  android: 'business',
  web: 'business',
};
const municipalitySymbol: SymbolViewProps['name'] = {
  ios: 'mappin.and.ellipse',
  android: 'location_city',
  web: 'location_city',
};
const dependentsSymbol: SymbolViewProps['name'] = {
  ios: 'person.2.fill',
  android: 'groups',
  web: 'groups',
};
const clothingSymbol: SymbolViewProps['name'] = {
  ios: 'tshirt.fill',
  android: 'checkroom',
  web: 'checkroom',
};
const shoeSymbol: SymbolViewProps['name'] = {
  ios: 'figure.walk',
  android: 'directions_walk',
  web: 'directions_walk',
};

export default function LogisticsStepScreen() {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);

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

  const continueToTerms = handleSubmit(
    () => {
      setHasSubmitErrors(false);
      persist('terms');
      router.push('/onboarding/terms');
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
      stepNumber={4}
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
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
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
      <Controller
        control={control}
        name="city"
        render={({ field }) => (
          <MunicipalityPicker
            label={t('cityLabel')}
            symbol={municipalitySymbol}
            value={field.value ?? ''}
            onChange={field.onChange}
            errorMessage={errors.city ? t('errorMunicipalityInvalid') : undefined}
          />
        )}
      />
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

      <View className="gap-xs">
        <OnboardingQuestionHeading label={t('referenceEntityLabel')} symbol={entitySymbol} />
        <Controller
          control={control}
          name="referenceEntity"
          render={({ field }) => (
            <View className="gap-sm">
              <OptionChip
                label={t('referenceEntityNone')}
                accessibilityHint={t('referenceEntityLabel')}
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
                  isInvalid={Boolean(errors.referenceEntity)}
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
        <OnboardingQuestionHeading label={t('hasDependentsLabel')} symbol={dependentsSymbol} />
        <Controller
          control={control}
          name="hasDependents"
          render={({ field }) => (
            <View className="flex-row gap-sm">
              <OptionChip
                label={t('yesOption')}
                accessibilityHint={t('hasDependentsLabel')}
                isSelected={field.value === true}
                onPress={() => field.onChange(true)}
              />
              <OptionChip
                label={t('noOption')}
                accessibilityHint={t('hasDependentsLabel')}
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
        <OnboardingQuestionHeading label={t('clothingSizeLabel')} symbol={clothingSymbol} />
        <Controller
          control={control}
          name="clothingSize"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {CLOTHING_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  accessibilityHint={t('clothingSizeLabel')}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </View>
          )}
        />
      </View>

      <View className="gap-xs">
        <OnboardingQuestionHeading label={t('shoeSizeLabel')} symbol={shoeSymbol} />
        <Controller
          control={control}
          name="shoeSize"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {SHOE_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  accessibilityHint={t('shoeSizeLabel')}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </View>
          )}
        />
      </View>
    </WizardFrame>
  );
}
