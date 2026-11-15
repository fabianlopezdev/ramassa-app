/**
 * One app field of the entity's referral form on the phone (RAPP-303,
 * RAPP-655), with the control the app asks it with everywhere: a country or
 * municipality list, the app's choices, a document type with its number. The
 * label is the placement's wording for the entity, else the field's own name,
 * else the app's own label, in the entity's language; an asterisk marks a
 * field the form requires. The web portal draws the same items.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { FieldErrorText } from '@/components/onboarding/field-error-text';
import { MunicipalityPicker } from '@/components/onboarding/municipality-picker';
import { OptionChip } from '@/components/onboarding/option-chip';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { BirthDateField } from '@/components/profile/profile-form-fields';
import {
  SeasonAnswerFields,
  type SeasonAnswers,
  type SeasonQuestion,
} from '@/components/profile/season-answer-fields';
import type { BuiltinWording } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  placementWordingIn,
  type EntityFormBuiltin,
  type EntityFormItem,
} from '@ramassa/shared/intake-builder';
import { DOCUMENT_TYPES, type DocumentType, type LanguageCode } from '@ramassa/shared/schemas';

const DOCUMENT_TYPE_KEYS: Readonly<Record<DocumentType, string>> = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
};

/** The app's own label of each field, when staff gave it no name. */
const APP_LABEL_KEYS: Readonly<Record<EntityFormBuiltin, string>> = {
  first_name: 'referrals:firstName',
  last_name: 'referrals:lastName',
  phone: 'referrals:phone',
  date_of_birth: 'onboarding:dateOfBirthLabel',
  nationality: 'onboarding:nationalityLabel',
  document: 'onboarding:documentTypeLabel',
  city: 'onboarding:cityLabel',
  applicant_status: 'onboarding:applicantStatusLabel',
  supporting_entities: 'onboarding:supportingEntitiesInstruction',
  reference_contact_name: 'onboarding:referenceContactNameLabel',
  childcare_need: 'onboarding:childcareNeedLabel',
  specific_needs: 'onboarding:specificNeedsLabel',
};

/** The referral's answers to the app fields, as the screen keeps them. */
interface ReferralBuiltinValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly dateOfBirth: string;
  readonly nationality: string;
  readonly documentType: DocumentType | null;
  readonly documentNumber: string;
  readonly city: string;
  readonly referenceContactName: string;
  readonly season: SeasonAnswers;
}

/** The fields whose value the form's own schema can refuse. */
export type ReferralCheckedField =
  'firstName' | 'lastName' | 'phone' | 'dateOfBirth' | 'documentNumber';

export interface ReferralBuiltinFieldProps {
  readonly item: Extract<EntityFormItem, { kind: 'builtin' }>;
  readonly values: ReferralBuiltinValues;
  readonly onChange: (patch: Partial<ReferralBuiltinValues>) => void;
  /** The form schema's message for a field, if it refused it. */
  readonly errorFor: (field: ReferralCheckedField) => string | undefined;
  /** Left empty although the form requires it. */
  readonly isMissing: boolean;
  readonly language: LanguageCode;
  /** The organization's partner entities, offered as other supporting entities. */
  readonly entityNames: readonly string[];
}

export function ReferralBuiltinField({
  item,
  values,
  onChange,
  errorFor,
  isMissing,
  language,
  entityNames,
}: ReferralBuiltinFieldProps) {
  const { t } = useTranslation(['referrals', 'onboarding']);
  const fontClass = useLanguageFontClass();
  const wording = placementWordingIn(item.placement, item.field, language);
  const isRequired = item.placement.required;
  const label = `${wording.label === '' ? t(APP_LABEL_KEYS[item.key]) : wording.label}${
    isRequired ? ' *' : ''
  }`;
  const hint = wording.help === '' ? null : wording.help;
  const missing = isMissing ? t('referrals:requiredError') : undefined;
  // The season questions read their wording from the placement here.
  const seasonWording = useMemo<BuiltinWording>(
    () => ({
      label: () => label,
      field: () => label,
      help: () => hint,
      options: (_question, options) => options,
    }),
    [label, hint],
  );

  switch (item.key) {
    case 'first_name':
    case 'last_name':
    case 'reference_contact_name': {
      const name =
        item.key === 'first_name'
          ? 'firstName'
          : item.key === 'last_name'
            ? 'lastName'
            : 'referenceContactName';
      return (
        <AuthTextField
          testID={`entity-referral-${item.key.replace(/_/g, '-')}`}
          label={label}
          hint={hint}
          value={values[name]}
          onChangeText={(text) => onChange({ [name]: text })}
          errorMessage={name === 'referenceContactName' ? missing : (errorFor(name) ?? missing)}
          maxLength={name === 'referenceContactName' ? 200 : 100}
        />
      );
    }
    case 'phone':
      return (
        <AuthTextField
          testID="entity-referral-phone"
          label={label}
          hint={hint}
          value={values.phone}
          onChangeText={(phone) => onChange({ phone })}
          errorMessage={errorFor('phone') ?? missing}
          // The phone input every phone field uses (RAPP-663): the field takes
          // an international number, and a local Spanish one gets +34.
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder={t('onboarding:phonePlaceholder')}
          maxLength={50}
        />
      );
    case 'date_of_birth':
      return (
        <View className="gap-xs">
          <BirthDateField
            testIDPrefix="entity-referral"
            label={label}
            value={values.dateOfBirth}
            onChange={(dateOfBirth) => onChange({ dateOfBirth })}
            errorMessage={errorFor('dateOfBirth') ?? missing}
          />
          <QuestionHelp text={hint} />
        </View>
      );
    case 'nationality':
      return (
        <CountryPicker
          label={label}
          value={values.nationality}
          onChange={(nationality) => onChange({ nationality })}
          errorMessage={missing}
        />
      );
    case 'city':
      return (
        <MunicipalityPicker
          label={label}
          value={values.city}
          onChange={(city) => onChange({ city })}
          errorMessage={missing}
        />
      );
    case 'document':
      return (
        <View className="gap-lg">
          <View className="gap-sm">
            <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
              {label}
            </Text>
            <QuestionHelp text={hint} />
            <View className="flex-row flex-wrap gap-sm">
              {DOCUMENT_TYPES.map((type) => (
                <OptionChip
                  key={type}
                  testID={`entity-referral-document-${type}`}
                  label={t(DOCUMENT_TYPE_KEYS[type])}
                  accessibilityHint={label}
                  isSelected={values.documentType === type}
                  onPress={() =>
                    onChange({ documentType: values.documentType === type ? null : type })
                  }
                />
              ))}
            </View>
            <FieldErrorText testID="entity-referral-missing-document" message={missing} />
          </View>
          {values.documentType === null || values.documentType === 'none' ? null : (
            <AuthTextField
              testID="entity-referral-document-number"
              label={t('onboarding:documentNumberLabel')}
              value={values.documentNumber}
              onChangeText={(documentNumber) => onChange({ documentNumber })}
              errorMessage={errorFor('documentNumber')}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={50}
            />
          )}
        </View>
      );
    case 'applicant_status':
    case 'supporting_entities':
    case 'childcare_need':
    case 'specific_needs': {
      const question: SeasonQuestion = item.key;
      return (
        <SeasonAnswerFields
          testIDPrefix="entity-referral"
          value={values.season}
          onChange={(patch) => onChange({ season: { ...values.season, ...patch } })}
          entityNames={entityNames}
          showSensitive
          shows={(each) => each === question}
          wording={seasonWording}
          missing={isMissing ? new Set([question]) : new Set()}
        />
      );
    }
  }
}
