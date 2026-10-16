/**
 * Completing the record of a woman who has not joined yet (RAPP-300).
 *
 * Her profile was created with her invitation. Staff fill in what they already
 * know, and her wizard asks only the rest, so this form differs from the full
 * edit form in three ways:
 *   - it shows only what somebody answered: an unknown answer stays empty
 *     instead of showing a default such as "M" or "no dependants";
 *   - only her names are required;
 *   - it sends only the fields staff changed, because each field sent becomes a
 *     staff answer and her wizard stops asking it.
 * Media consent is not here: that consent is hers to give.
 */

import {
  DEPENDENT_COUNTS,
  SelectField,
  TextField,
} from '@/components/participants/participant-form-fields';
import { Button } from '@/components/ui/button';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import { getCountryOptions } from '@ramassa/shared/i18n/countries';
import type { AnsweredQuestions } from '@ramassa/shared/intake';
import {
  buildProfilePrefillPayload,
  prefillFromRow,
  profilePrefillSchema,
  type ParticipantDetailRow,
  type ProfilePrefill,
  type ProfilePrefillInput,
  type ProfilePrefillPayload,
} from '@ramassa/shared/participants';
import { CLOTHING_SIZES, DOCUMENT_TYPES, SHOE_SIZES } from '@ramassa/shared/schemas';

const prefillResolver = zodResolver(profilePrefillSchema);

export interface ParticipantPrefillFormProps {
  readonly participant: ParticipantDetailRow;
  readonly answered: AnsweredQuestions;
  /** Holds `participants.view_sensitive`: shows the four encrypted fields. */
  readonly canSeeSensitive: boolean;
  readonly onSubmit: (payload: ProfilePrefillPayload) => Promise<void>;
  readonly onCancel: () => void;
  readonly errorMessage?: string;
}

export function ParticipantPrefillForm({
  participant,
  answered,
  canSeeSensitive,
  onSubmit,
  onCancel,
  errorMessage,
}: ParticipantPrefillFormProps) {
  const { t, i18n } = useTranslation(['participants', 'onboarding', 'profile']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const [isBlocked, setIsBlocked] = useState(false);
  const notGiven = t('participants:prefillNotGiven');

  const countryOptions = useMemo(
    () => getCountryOptions(locale as (typeof SUPPORTED_LANGUAGES)[number]),
    [locale],
  );

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<ProfilePrefillInput, unknown, ProfilePrefill>({
    resolver: prefillResolver,
    values: prefillFromRow(participant, answered),
  });

  const documentType = watch('documentType');
  const hasDependents = watch('hasDependents');

  const save = handleSubmit(
    async (values) => {
      setIsBlocked(false);
      const payload = buildProfilePrefillPayload(values, new Set(Object.keys(dirtyFields)));
      if (Object.keys(payload).length === 0) {
        onCancel();
        return;
      }
      await onSubmit(payload);
    },
    () => setIsBlocked(true),
  );

  return (
    <form onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-6">
      <p
        data-testid="participant-prefill-hint"
        className="text-start text-sm text-muted-foreground"
      >
        {t('participants:prefillHint')}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          control={control}
          name="firstName"
          label={t('onboarding:firstNameLabel')}
          errorMessage={errors.firstName ? t('onboarding:errorRequired') : undefined}
        />
        <TextField
          control={control}
          name="lastName"
          label={t('onboarding:lastNameLabel')}
          errorMessage={errors.lastName ? t('onboarding:errorRequired') : undefined}
        />
        <TextField
          control={control}
          name="dateOfBirth"
          type="date"
          label={t('onboarding:dateOfBirthLabel')}
          errorMessage={errors.dateOfBirth ? t('onboarding:errorInvalidDate') : undefined}
        />
        <TextField
          control={control}
          name="placeOfBirth"
          label={t('onboarding:placeOfBirthLabel')}
        />
        <SelectField
          control={control}
          name="nationality"
          label={t('onboarding:nationalityLabel')}
          emptyLabel={notGiven}
          options={countryOptions.map((country) => ({
            value: country.canonical,
            label: country.label,
          }))}
        />
        <SelectField
          control={control}
          name="preferredLanguage"
          label={t('profile:languageLabel')}
          emptyLabel={notGiven}
          options={SUPPORTED_LANGUAGES.map((language) => ({
            value: language,
            label: LANGUAGE_NATIVE_NAMES[language],
          }))}
        />
        <SelectField
          control={control}
          name="documentType"
          label={t('onboarding:documentTypeLabel')}
          emptyLabel={notGiven}
          options={DOCUMENT_TYPES.map((type) => ({
            value: type,
            label: t(`onboarding:documentType${type.charAt(0).toUpperCase()}${type.slice(1)}`),
          }))}
        />
        {!canSeeSensitive || documentType === undefined || documentType === 'none' ? null : (
          <TextField
            control={control}
            name="documentNumber"
            label={t('onboarding:documentNumberLabel')}
            errorMessage={
              errors.documentNumber && documentType === 'nie'
                ? t('onboarding:errorNieFormat')
                : undefined
            }
          />
        )}
        {canSeeSensitive ? (
          <>
            <TextField
              control={control}
              name="phone"
              label={t('profile:fieldPhone')}
              placeholder={t('onboarding:phonePlaceholder')}
              errorMessage={errors.phone ? t('onboarding:errorPhoneFormat') : undefined}
            />
            <TextField control={control} name="address" label={t('profile:fieldAddress')} />
          </>
        ) : null}
        <TextField control={control} name="city" label={t('profile:fieldCity')} />
        {canSeeSensitive ? (
          <TextField
            control={control}
            name="postalCode"
            label={t('profile:fieldPostalCode')}
            errorMessage={errors.postalCode ? t('onboarding:errorPostalFormat') : undefined}
          />
        ) : null}
        <TextField
          control={control}
          name="referenceEntity"
          label={t('participants:columnEntity')}
        />
        <TextField
          control={control}
          name="referenceContactName"
          label={t('onboarding:referenceContactNameLabel')}
        />
        <SelectField
          control={control}
          name="hasDependents"
          label={t('participants:columnDependents')}
          emptyLabel={notGiven}
          options={[
            { value: 'true', label: t('onboarding:yesOption') },
            { value: 'false', label: t('onboarding:noOption') },
          ]}
          toFieldValue={(value) => value === 'true'}
          fromFieldValue={(value) => String(value)}
        />
        {hasDependents === true ? (
          <SelectField
            control={control}
            name="numDependents"
            label={t('onboarding:numDependentsLabel')}
            emptyLabel={notGiven}
            options={DEPENDENT_COUNTS.map((count) => ({ value: count, label: count }))}
            toFieldValue={(value) => Number(value)}
            fromFieldValue={(value) => String(value)}
            errorMessage={errors.numDependents ? t('onboarding:errorDependentsRange') : undefined}
          />
        ) : null}
        <SelectField
          control={control}
          name="clothingSize"
          label={t('onboarding:clothingSizeLabel')}
          emptyLabel={notGiven}
          options={CLOTHING_SIZES.map((size) => ({ value: size, label: size }))}
        />
        <SelectField
          control={control}
          name="shoeSize"
          label={t('onboarding:shoeSizeLabel')}
          emptyLabel={notGiven}
          options={SHOE_SIZES.map((size) => ({ value: size, label: size }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {t('profile:saveAction')}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={onCancel}>
          {t('profile:cancelAction')}
        </Button>
        {isBlocked ? (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {t('profile:saveBlocked')}
          </p>
        ) : null}
        {errorMessage === undefined ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </form>
  );
}
