/**
 * The inputs of one of the app's own fields (RAPP-653), for her page's inline
 * editing: the full record's form of a joined player and the partial form of
 * a woman who has not joined both draw a field with these, so one field has
 * one set of inputs.
 *
 * Enumerable answers are pickers (rule 18): nationality from the country
 * list, sizes, choices. A field above the reader's level is never drawn: her
 * page shows it locked, and the database keeps the stored value.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import {
  DEPENDENT_COUNTS,
  SelectField,
  TextField,
} from '@/components/participants/participant-form-fields';
import { useMemo } from 'react';
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import { getCountryOptions } from '@ramassa/shared/i18n/countries';
import {
  APPLICANT_STATUSES,
  CHILDCARE_NEEDS,
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  formatSupportNeeds,
  SHOE_SIZES,
} from '@ramassa/shared/schemas';

/** A field her page edits inline: one of the app's questions, or her photo consent. */
export type BuiltinEditKey =
  | 'first_name'
  | 'last_name'
  | 'date_of_birth'
  | 'place_of_birth'
  | 'nationality'
  | 'preferred_language'
  | 'document'
  | 'phone'
  | 'address'
  | 'city'
  | 'postal_code'
  | 'reference_entity'
  | 'reference_contact_name'
  | 'dependents'
  | 'clothing_size'
  | 'shoe_size'
  | 'applicant_status'
  | 'supporting_entities'
  | 'childcare_need'
  | 'specific_needs'
  | 'media_consent';

export const BUILTIN_EDIT_KEYS: readonly BuiltinEditKey[] = [
  'first_name',
  'last_name',
  'date_of_birth',
  'place_of_birth',
  'nationality',
  'preferred_language',
  'document',
  'phone',
  'address',
  'city',
  'postal_code',
  'reference_entity',
  'reference_contact_name',
  'dependents',
  'clothing_size',
  'shoe_size',
  'applicant_status',
  'supporting_entities',
  'childcare_need',
  'specific_needs',
  'media_consent',
];

export function isBuiltinEditKey(key: string | null): key is BuiltinEditKey {
  return key !== null && (BUILTIN_EDIT_KEYS as readonly string[]).includes(key);
}

const APPLICANT_STATUS_KEYS = {
  asylum_seeker: 'onboarding:applicantStatusAsylumSeeker',
  refugee: 'onboarding:applicantStatusRefugee',
  migrant: 'onboarding:applicantStatusMigrant',
  other: 'onboarding:applicantStatusOther',
  prefer_not_to_say: 'onboarding:applicantStatusPreferNotToSay',
} as const;

const CHILDCARE_KEYS = {
  yes: 'onboarding:childcareNeedYes',
  no: 'onboarding:childcareNeedNo',
  maybe: 'onboarding:childcareNeedMaybe',
} as const;

export interface BuiltinFieldControlsProps<Values extends FieldValues, Output> {
  readonly fieldKey: BuiltinEditKey;
  readonly control: Control<Values, unknown, Output>;
  readonly errors: FieldErrors<Values>;
  readonly canSeeSensitive: boolean;
  /**
   * The empty first choice of a picker: a woman who has not joined may have
   * no answer yet (RAPP-300). Absent for a joined player's full record.
   */
  readonly emptyLabel?: string;
}

export function BuiltinFieldControls<Values extends FieldValues, Output>({
  fieldKey,
  control,
  errors,
  canSeeSensitive,
  emptyLabel,
}: BuiltinFieldControlsProps<Values, Output>) {
  const { t, i18n } = useTranslation(['participants', 'onboarding', 'profile']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const name = (field: string) => field as Path<Values>;
  const hasError = (field: string) => (errors as Record<string, unknown>)[field] !== undefined;
  const documentType = useWatch({ control, name: name('documentType') }) as string | undefined;
  const hasDependents = useWatch({ control, name: name('hasDependents') }) as boolean | undefined;
  const countryOptions = useMemo(
    () => getCountryOptions(locale as (typeof SUPPORTED_LANGUAGES)[number]),
    [locale],
  );
  const yesNo = [
    { value: 'true', label: t('onboarding:yesOption') },
    { value: 'false', label: t('onboarding:noOption') },
  ];

  switch (fieldKey) {
    case 'first_name':
      return (
        <TextField
          control={control}
          name={name('firstName')}
          label={t('onboarding:firstNameLabel')}
          errorMessage={hasError('firstName') ? t('onboarding:errorRequired') : undefined}
        />
      );
    case 'last_name':
      return (
        <TextField
          control={control}
          name={name('lastName')}
          label={t('onboarding:lastNameLabel')}
          errorMessage={hasError('lastName') ? t('onboarding:errorRequired') : undefined}
        />
      );
    case 'date_of_birth':
      return (
        <TextField
          control={control}
          name={name('dateOfBirth')}
          type="date"
          label={t('onboarding:dateOfBirthLabel')}
          errorMessage={hasError('dateOfBirth') ? t('onboarding:errorInvalidDate') : undefined}
        />
      );
    case 'place_of_birth':
      return (
        <TextField
          control={control}
          name={name('placeOfBirth')}
          label={t('onboarding:placeOfBirthLabel')}
          errorMessage={hasError('placeOfBirth') ? t('onboarding:errorRequired') : undefined}
        />
      );
    case 'nationality':
      return (
        <SelectField
          control={control}
          name={name('nationality')}
          label={t('onboarding:nationalityLabel')}
          emptyLabel={emptyLabel}
          options={countryOptions.map((country) => ({
            value: country.canonical,
            label: country.label,
          }))}
          errorMessage={hasError('nationality') ? t('onboarding:errorRequired') : undefined}
        />
      );
    case 'preferred_language':
      return (
        <SelectField
          control={control}
          name={name('preferredLanguage')}
          label={t('profile:languageLabel')}
          emptyLabel={emptyLabel}
          options={SUPPORTED_LANGUAGES.map((language) => ({
            value: language,
            label: LANGUAGE_NATIVE_NAMES[language],
          }))}
        />
      );
    case 'document':
      return (
        <>
          <SelectField
            control={control}
            name={name('documentType')}
            label={t('onboarding:documentTypeLabel')}
            // Optional (RAPP-302): empty is "not given", which is not "no document".
            emptyLabel={emptyLabel ?? t('onboarding:documentTypeNotGiven')}
            options={DOCUMENT_TYPES.map((type) => ({
              value: type,
              label: t(`onboarding:documentType${type.charAt(0).toUpperCase()}${type.slice(1)}`),
            }))}
          />
          {documentType === 'other' ? (
            <TextField
              control={control}
              name={name('documentName')}
              label={t('onboarding:documentNameLabel')}
            />
          ) : null}
          {!canSeeSensitive || documentType === undefined || documentType === 'none' ? null : (
            <TextField
              control={control}
              name={name('documentNumber')}
              label={t('onboarding:documentNumberLabel')}
              errorMessage={
                hasError('documentNumber')
                  ? documentType === 'nie'
                    ? t('onboarding:errorNieFormat')
                    : t('onboarding:errorRequired')
                  : undefined
              }
            />
          )}
        </>
      );
    case 'phone':
      return (
        <TextField
          control={control}
          name={name('phone')}
          label={t('profile:fieldPhone')}
          placeholder={t('onboarding:phonePlaceholder')}
          errorMessage={hasError('phone') ? t('onboarding:errorPhoneFormat') : undefined}
        />
      );
    case 'address':
      return (
        <TextField control={control} name={name('address')} label={t('profile:fieldAddress')} />
      );
    case 'city':
      return <TextField control={control} name={name('city')} label={t('profile:fieldCity')} />;
    case 'postal_code':
      return (
        <TextField
          control={control}
          name={name('postalCode')}
          label={t('profile:fieldPostalCode')}
          errorMessage={hasError('postalCode') ? t('onboarding:errorPostalFormat') : undefined}
        />
      );
    case 'reference_entity':
      return (
        <TextField
          control={control}
          name={name('referenceEntity')}
          label={t('participants:columnEntity')}
          errorMessage={hasError('referenceEntity') ? t('onboarding:errorRequired') : undefined}
        />
      );
    case 'reference_contact_name':
      return (
        <TextField
          control={control}
          name={name('referenceContactName')}
          label={t('onboarding:referenceContactNameLabel')}
        />
      );
    case 'dependents':
      return (
        <>
          <SelectField
            control={control}
            name={name('hasDependents')}
            label={t('participants:columnDependents')}
            emptyLabel={emptyLabel}
            options={yesNo}
            toFieldValue={(value) => value === 'true'}
            fromFieldValue={(value) => String(value)}
          />
          {hasDependents === true ? (
            <SelectField
              control={control}
              name={name('numDependents')}
              label={t('onboarding:numDependentsLabel')}
              emptyLabel={emptyLabel}
              options={DEPENDENT_COUNTS.map((count) => ({ value: count, label: count }))}
              toFieldValue={(value) => Number(value)}
              fromFieldValue={(value) => String(value)}
              errorMessage={
                hasError('numDependents') ? t('onboarding:errorDependentsRange') : undefined
              }
            />
          ) : null}
        </>
      );
    case 'clothing_size':
      return (
        <SelectField
          control={control}
          name={name('clothingSize')}
          label={t('onboarding:clothingSizeLabel')}
          emptyLabel={emptyLabel}
          options={CLOTHING_SIZES.map((size) => ({ value: size, label: size }))}
        />
      );
    case 'shoe_size':
      return (
        <SelectField
          control={control}
          name={name('shoeSize')}
          label={t('onboarding:shoeSizeLabel')}
          emptyLabel={emptyLabel}
          options={SHOE_SIZES.map((size) => ({ value: size, label: size }))}
        />
      );
    case 'applicant_status':
      return (
        <SelectField
          control={control}
          name={name('applicantStatus')}
          label={t('onboarding:applicantStatusLabel')}
          emptyLabel={emptyLabel ?? t('profile:notProvided')}
          options={APPLICANT_STATUSES.map((status) => ({
            value: status,
            label: t(APPLICANT_STATUS_KEYS[status]),
          }))}
        />
      );
    case 'supporting_entities':
      // A comma-separated list: staff type the names the entity gave.
      return (
        <Controller
          control={control}
          name={name('supportingEntities')}
          render={({ field }) => (
            <AdminAuthField
              id="participant-supportingEntities"
              label={t('onboarding:supportingEntitiesLabel')}
              className="h-9"
              value={((field.value as string[] | undefined) ?? []).join(', ')}
              onChange={(event) =>
                field.onChange(
                  event.target.value
                    .split(',')
                    .map((entry) => entry.trimStart())
                    .filter((entry, index, all) => entry !== '' || index === all.length - 1),
                )
              }
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
      );
    case 'childcare_need':
      return (
        <SelectField
          control={control}
          name={name('childcareNeed')}
          label={t('onboarding:childcareNeedLabel')}
          emptyLabel={emptyLabel ?? t('profile:notProvided')}
          options={CHILDCARE_NEEDS.map((need) => ({ value: need, label: t(CHILDCARE_KEYS[need]) }))}
        />
      );
    case 'specific_needs':
      return (
        <TextField
          control={control}
          name={name('specificNeeds')}
          formatValue={(value) => formatSupportNeeds(value, t)}
          label={t('onboarding:specificNeedsLabel')}
          placeholder={t('onboarding:specificNeedsHint')}
        />
      );
    case 'media_consent':
      return (
        <SelectField
          control={control}
          name={name('mediaConsent')}
          label={t('profile:fieldMediaConsent')}
          options={yesNo}
          toFieldValue={(value) => value === 'true'}
          fromFieldValue={(value) => String(value)}
        />
      );
  }
}
