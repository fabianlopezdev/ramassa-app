/**
 * The profile form's fields, shared by her own edit screen (RAPP-22) and the
 * team's edit screen for a participant (RAPP-281).
 *
 * One set of controls, so a woman's record is asked for in the same shape
 * whoever fills it in: the intake wizard's text field, option chip and pickers,
 * with the same validation messages. The team's form adds the fields that only
 * staff set from here (date of birth, app language, referring entity and its
 * contact), and leaves out the four encrypted fields when the person may not
 * see them. The database keeps those values when they are absent.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { MunicipalityPicker } from '@/components/onboarding/municipality-picker';
import { OptionChip } from '@/components/onboarding/option-chip';
import {
  SeasonAnswerFields,
  type SeasonAnswers,
  type SeasonQuestion,
} from '@/components/profile/season-answer-fields';
import { useSupportingEntityNames } from '@/lib/entity-referrals';
import { composeIsoBirthDate } from '@/lib/onboarding-form';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState, type ReactNode } from 'react';
import { Controller, useController, type Control, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { z } from 'zod';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import type { IntakeQuestion } from '@ramassa/shared/intake';
import {
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  SHOE_SIZES,
  type ProfileEdit,
  type profileEditSchema,
} from '@ramassa/shared/schemas';

export type ProfileEditInput = z.input<typeof profileEditSchema>;

/**
 * The document type's translation key, mapped explicitly and hoisted.
 *
 * Not built from the stored value (`documentType${type.charAt(0)...}`) for the
 * reason the profile read view already gives for its own mapping: a value that
 * ever stopped matching a key would put the raw key on screen instead of
 * failing loudly. Hoisting it also stops four string builds per render of a
 * form that re-renders whenever a watched field changes.
 */
export const DOCUMENT_TYPE_LABEL_KEYS = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
} as const;

/**
 * Everything that is not a digit, stripped from the dependants count so a
 * pasted "2 fills" or an Arabic-Indic keyboard's stray character cannot reach
 * `Number()`.
 *
 * Hoisted, and this one the React Compiler cannot do for us: a regex LITERAL
 * builds a fresh RegExp every time the expression is evaluated, and this one is
 * evaluated per KEYSTROKE inside an event handler rather than per render. The
 * compiler memoizes renders, not calls. Safe as a shared instance because
 * `String.prototype.replace` with a global regex resets `lastIndex` itself;
 * `.test()` is the one that would carry state between calls.
 */
const NON_DIGITS = /\D/g;

/** Every question keeps its own control. */
const NONE_OFF_THEIR_CONTROL: ReadonlySet<IntakeQuestion> = new Set();

/** The stored ISO date as the three boxes show it; blank parts stay blank. */
function birthDateParts(iso: string | undefined) {
  const [year = '', month = '', day = ''] = (iso ?? '').split('-');
  return { day, month, year };
}

function ChoiceGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="gap-xs">
      <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-sm">{children}</View>
    </View>
  );
}

/**
 * Day, month and year boxes over one ISO date, as the intake wizard asks for
 * it. The boxes keep what was typed, so a half-typed date stays on screen and
 * the shared schema names it invalid on Save.
 */
export function BirthDateField({
  value,
  onChange,
  errorMessage,
  testIDPrefix = 'participant-edit',
  label,
}: {
  readonly value: string | undefined;
  readonly onChange: (iso: string) => void;
  readonly errorMessage: string | undefined;
  /** Prefix of the three boxes' test ids. */
  readonly testIDPrefix?: string;
  /** The question's wording; the app's own label without it. */
  readonly label?: string;
}) {
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const [parts, setParts] = useState(() => birthDateParts(value));
  // A value set from outside (the form loading her record after this field
  // mounted, RAPP-300) replaces the boxes. While she types, the form value is
  // the typed parts composed, so this never undoes a half-typed date.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value !== composeIsoBirthDate(parts.day, parts.month, parts.year)) {
      setParts(birthDateParts(value));
    }
  }
  const change = (part: 'day' | 'month' | 'year', text: string) => {
    const next = { ...parts, [part]: text.replace(NON_DIGITS, '') };
    setParts(next);
    onChange(composeIsoBirthDate(next.day, next.month, next.year));
  };
  return (
    <View className="gap-xs">
      <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {label ?? t('dateOfBirthLabel')}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        <View className="min-w-[72px] flex-1">
          <AuthTextField
            testID={`${testIDPrefix}-day`}
            label={t('dayLabel')}
            value={parts.day}
            onChangeText={(text) => change('day', text)}
            isInvalid={errorMessage !== undefined}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View className="min-w-[72px] flex-1">
          <AuthTextField
            testID={`${testIDPrefix}-month`}
            label={t('monthLabel')}
            value={parts.month}
            onChangeText={(text) => change('month', text)}
            isInvalid={errorMessage !== undefined}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View className="min-w-[96px] flex-[1.5]">
          <AuthTextField
            testID={`${testIDPrefix}-year`}
            label={t('yearLabel')}
            value={parts.year}
            onChangeText={(text) => change('year', text)}
            isInvalid={errorMessage !== undefined}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </View>
      {errorMessage === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

/**
 * The season registration answers (RAPP-303) wired to this form: five
 * controllers composed into the shared block. The partner entity names are
 * offered to staff; her own screen lists only what she already has.
 */
function SeasonAnswerControllers({
  control,
  showSensitive,
  testIDPrefix,
  shows,
}: {
  readonly control: Control<ProfileEditInput, unknown, ProfileEdit>;
  readonly showSensitive: boolean;
  readonly testIDPrefix: string;
  /** Whether a season question keeps its own control here. */
  readonly shows: (question: SeasonQuestion) => boolean;
}) {
  const { t } = useTranslation(['onboarding']);
  const languageFontClass = useLanguageFontClass();
  const entityNames = useSupportingEntityNames();
  const applicantStatus = useController({ control, name: 'applicantStatus' });
  const supportingEntities = useController({ control, name: 'supportingEntities' });
  const seasonNumber = useController({ control, name: 'seasonNumber' });
  const childcareNeed = useController({ control, name: 'childcareNeed' });
  const specificNeeds = useController({ control, name: 'specificNeeds' });
  const value: SeasonAnswers = {
    applicantStatus: (applicantStatus.field.value as SeasonAnswers['applicantStatus']) ?? null,
    supportingEntities: (supportingEntities.field.value as string[] | undefined) ?? [],
    seasonNumber: (seasonNumber.field.value as SeasonAnswers['seasonNumber']) ?? null,
    childcareNeed: (childcareNeed.field.value as SeasonAnswers['childcareNeed']) ?? null,
    specificNeeds: (specificNeeds.field.value as string | undefined) ?? '',
  };
  return (
    <View className="gap-md">
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
      >
        {t('onboarding:seasonSectionTitle')}
      </Text>
      <SeasonAnswerFields
        testIDPrefix={testIDPrefix}
        value={value}
        entityNames={entityNames.data ?? []}
        showSensitive={showSensitive}
        shows={shows}
        onChange={(patch) => {
          if ('applicantStatus' in patch)
            applicantStatus.field.onChange(patch.applicantStatus ?? undefined);
          if ('supportingEntities' in patch)
            supportingEntities.field.onChange(patch.supportingEntities);
          if ('seasonNumber' in patch) seasonNumber.field.onChange(patch.seasonNumber ?? undefined);
          if ('childcareNeed' in patch)
            childcareNeed.field.onChange(patch.childcareNeed ?? undefined);
          if ('specificNeeds' in patch) specificNeeds.field.onChange(patch.specificNeeds);
        }}
      />
    </View>
  );
}

export function ProfileFormFields({
  control,
  errors,
  documentType,
  hasDependents,
  audience,
  showSensitive = true,
  showMediaConsent = true,
  testIDPrefix,
  offTheirControl = NONE_OFF_THEIR_CONTROL,
  offControlFields = null,
}: {
  readonly control: Control<ProfileEditInput, unknown, ProfileEdit>;
  readonly errors: FieldErrors<ProfileEditInput>;
  readonly documentType: ProfileEditInput['documentType'];
  readonly hasDependents: boolean | undefined;
  /** `self` is her own profile; `staff` is the team editing her record. */
  readonly audience: 'self' | 'staff';
  /** Document number, phone, address and postal code. */
  readonly showSensitive?: boolean;
  /** False for a woman who has not joined yet (RAPP-300): that consent is hers to give. */
  readonly showMediaConsent?: boolean;
  readonly testIDPrefix: string;
  /**
   * The app questions whose own control no longer fits their field
   * (RAPP-666, `questionsOffTheirControl`): their controls are hidden.
   */
  readonly offTheirControl?: ReadonlySet<IntakeQuestion>;
  /** Their fields, drawn by the generic renderer after the app's own controls. */
  readonly offControlFields?: ReactNode;
}) {
  const { t } = useTranslation(['profile', 'onboarding', 'participants']);
  const isStaff = audience === 'staff';
  const asks = (question: IntakeQuestion) => !offTheirControl.has(question);

  return (
    <>
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <AuthTextField
            // Same convention as the wizard's fields: the label is rendered
            // twice on this control, as the visible caption and as the input's
            // accessibility label, so matching by text is ambiguous and can
            // resolve to the caption, which nothing can type into. The suite
            // edits this field because it is the first one on both this screen
            // and the profile screen, so proving an edit survives needs no
            // scrolling on either.
            testID={`${testIDPrefix}-first-name`}
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
      {isStaff && asks('date_of_birth') ? (
        <Controller
          control={control}
          name="dateOfBirth"
          render={({ field }) => (
            <BirthDateField
              value={field.value}
              onChange={field.onChange}
              errorMessage={
                errors.dateOfBirth
                  ? errors.dateOfBirth.message === 'too young'
                    ? t('onboarding:errorTooYoung')
                    : t('onboarding:errorInvalidDate')
                  : undefined
              }
            />
          )}
        />
      ) : null}
      {asks('place_of_birth') ? (
        <Controller
          control={control}
          name="placeOfBirth"
          render={({ field }) => (
            <AuthTextField
              // The field the smoke suite edits. Chosen because the seed leaves it
              // NULL for the participant the suite signs in as (deliberately: two
              // rows keep a null so the "created before this field existed" case
              // is covered), so the flow can type into it without first erasing
              // what is there - and erasing an Arabic-script value through the
              // Android driver hangs until Maestro's own two-minute deadline.
              testID={`${testIDPrefix}-place-of-birth`}
              label={t('onboarding:placeOfBirthLabel')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={errors.placeOfBirth ? t('onboarding:errorRequired') : undefined}
            />
          )}
        />
      ) : null}
      {asks('nationality') ? (
        <Controller
          control={control}
          name="nationality"
          render={({ field }) => (
            <CountryPicker
              label={t('onboarding:nationalityLabel')}
              value={field.value ?? ''}
              onChange={field.onChange}
              errorMessage={errors.nationality ? t('onboarding:errorRequired') : undefined}
            />
          )}
        />
      ) : null}
      {isStaff ? (
        <Controller
          control={control}
          name="preferredLanguage"
          render={({ field }) => (
            <ChoiceGroup label={t('profile:languageLabel')}>
              {SUPPORTED_LANGUAGES.map((language) => (
                <OptionChip
                  key={language}
                  label={LANGUAGE_NATIVE_NAMES[language]}
                  accessibilityHint={t('profile:languageLabel')}
                  isSelected={field.value === language}
                  onPress={() => field.onChange(language)}
                />
              ))}
            </ChoiceGroup>
          )}
        />
      ) : null}

      {asks('document') ? (
        <Controller
          control={control}
          name="documentType"
          render={({ field }) => (
            <ChoiceGroup label={t('onboarding:documentTypeLabel')}>
              {DOCUMENT_TYPES.map((type) => (
                <OptionChip
                  key={type}
                  label={t(DOCUMENT_TYPE_LABEL_KEYS[type])}
                  accessibilityHint={t('onboarding:documentTypeLabel')}
                  isSelected={field.value === type}
                  onPress={() => field.onChange(type)}
                />
              ))}
              {/* The document is optional (RAPP-302). "Not given" is not "I have
                  none": choosing it empties the type and the number. */}
              <OptionChip
                label={t('onboarding:documentTypeNotGiven')}
                accessibilityHint={t('onboarding:documentTypeLabel')}
                isSelected={field.value === undefined}
                onPress={() => field.onChange(undefined)}
              />
            </ChoiceGroup>
          )}
        />
      ) : null}

      {documentType !== 'other' || !asks('document') ? null : (
        <Controller
          control={control}
          name="documentName"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:documentNameLabel')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              maxLength={100}
            />
          )}
        />
      )}
      {/* No number without a type: an unanswered document (RAPP-300) asks the type first. */}
      {documentType === undefined ||
      documentType === 'none' ||
      !showSensitive ||
      !asks('document') ? null : (
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

      {showSensitive && asks('phone') ? (
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <AuthTextField
              // Same testID convention as the wizard's fields, and for the same
              // reason: the label is rendered TWICE on this control, once as the
              // visible caption and once as the input's accessibility label, so
              // matching a field by its text is ambiguous and can resolve to the
              // caption, which nothing can type into. The suite edits this field.
              testID={`${testIDPrefix}-phone`}
              label={t('onboarding:optionalFieldLabel', { label: t('onboarding:phoneLabel') })}
              placeholder={t('onboarding:phonePlaceholder')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={errors.phone ? t('onboarding:errorPhoneFormat') : undefined}
              keyboardType="phone-pad"
            />
          )}
        />
      ) : null}
      {showSensitive && asks('address') ? (
        <Controller
          control={control}
          name="address"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:optionalFieldLabel', { label: t('onboarding:addressLabel') })}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ) : null}
      {asks('city') ? (
        <Controller
          control={control}
          name="city"
          render={({ field }) => (
            <MunicipalityPicker
              label={t('onboarding:optionalFieldLabel', { label: t('onboarding:cityLabel') })}
              value={field.value ?? ''}
              onChange={field.onChange}
              errorMessage={errors.city ? t('onboarding:errorMunicipalityInvalid') : undefined}
            />
          )}
        />
      ) : null}
      {showSensitive && asks('postal_code') ? (
        <Controller
          control={control}
          name="postalCode"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:optionalFieldLabel', { label: t('onboarding:postalCodeLabel') })}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={errors.postalCode ? t('onboarding:errorPostalFormat') : undefined}
              keyboardType="number-pad"
            />
          )}
        />
      ) : null}

      {isStaff && asks('reference_entity') ? (
        <Controller
          control={control}
          name="referenceEntity"
          render={({ field }) => (
            <AuthTextField
              testID={`${testIDPrefix}-entity`}
              label={t('participants:columnEntity')}
              value={field.value ?? ''}
              onChangeText={(text) => field.onChange(text.length === 0 ? null : text)}
              onBlur={field.onBlur}
              errorMessage={errors.referenceEntity ? t('onboarding:errorRequired') : undefined}
            />
          )}
        />
      ) : null}
      {isStaff && asks('reference_contact_name') ? (
        <Controller
          control={control}
          name="referenceContactName"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:optionalFieldLabel', {
                label: t('onboarding:referenceContactNameLabel'),
              })}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ) : null}

      {asks('dependents') ? (
        <Controller
          control={control}
          name="hasDependents"
          render={({ field }) => {
            // The wizard asks her "do you have anyone in your care?"; the team's
            // form names the field instead, because it talks about her.
            const label = isStaff
              ? t('participants:columnDependents')
              : t('onboarding:hasDependentsLabel');
            return (
              <ChoiceGroup label={label}>
                <OptionChip
                  label={t('onboarding:yesOption')}
                  accessibilityHint={label}
                  isSelected={field.value === true}
                  onPress={() => field.onChange(true)}
                />
                <OptionChip
                  label={t('onboarding:noOption')}
                  accessibilityHint={label}
                  isSelected={field.value === false}
                  onPress={() => field.onChange(false)}
                />
              </ChoiceGroup>
            );
          }}
        />
      ) : null}

      {hasDependents && asks('dependents') ? (
        <Controller
          control={control}
          name="numDependents"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:numDependentsLabel')}
              value={String(field.value ?? '')}
              onChangeText={(text) => field.onChange(Number(text.replace(NON_DIGITS, '')) || 0)}
              onBlur={field.onBlur}
              errorMessage={errors.numDependents ? t('onboarding:errorDependentsRange') : undefined}
              keyboardType="number-pad"
            />
          )}
        />
      ) : null}

      {asks('clothing_size') ? (
        <Controller
          control={control}
          name="clothingSize"
          render={({ field }) => (
            <ChoiceGroup label={t('onboarding:clothingSizeLabel')}>
              {CLOTHING_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  accessibilityHint={t('onboarding:clothingSizeLabel')}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </ChoiceGroup>
          )}
        />
      ) : null}

      {asks('shoe_size') ? (
        <Controller
          control={control}
          name="shoeSize"
          render={({ field }) => (
            <ChoiceGroup label={t('onboarding:shoeSizeLabel')}>
              {SHOE_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  accessibilityHint={t('onboarding:shoeSizeLabel')}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </ChoiceGroup>
          )}
        />
      ) : null}

      {/* The revocable consent, in both directions. The wizard told her she
          could change this from her profile; this is the control that keeps
          that promise. */}
      <SeasonAnswerControllers
        control={control}
        showSensitive={showSensitive}
        testIDPrefix={testIDPrefix}
        shows={asks}
      />

      {/* The app fields off their own control (RAPP-666): the generic renderer
          asks them, where her wizard would. */}
      {offControlFields}

      {showMediaConsent ? (
        <Controller
          control={control}
          name="mediaConsent"
          render={({ field }) => {
            const label = isStaff
              ? t('profile:fieldMediaConsent')
              : t('onboarding:mediaConsentLabel');
            return (
              <ChoiceGroup label={label}>
                <OptionChip
                  label={t('onboarding:yesOption')}
                  accessibilityHint={label}
                  isSelected={field.value === true}
                  onPress={() => field.onChange(true)}
                />
                <OptionChip
                  label={t('onboarding:noOption')}
                  accessibilityHint={label}
                  isSelected={field.value === false}
                  onPress={() => field.onChange(false)}
                />
              </ChoiceGroup>
            );
          }}
        />
      ) : null}
    </>
  );
}
