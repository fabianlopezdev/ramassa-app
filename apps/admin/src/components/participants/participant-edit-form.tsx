/**
 * Editing a participant's record, as staff (RAPP-24).
 *
 * Validated by `profileEditSchema` and submitted through
 * `buildUpdateOwnProfilePayload`: the SAME schema and the SAME mapper the
 * player's own edit screen uses, composed in turn from the intake fields. There
 * is no admin copy of any of it, which is the whole point of scope item 2. A
 * staff member fixing a participant's NIE has to be held to the rule the
 * participant was held to, or "valid" quietly becomes two things and the one
 * that drifts is the one nobody re-reads.
 *
 * Enumerable answers are PICKERS (CLAUDE.md rule 18), here as on the phone:
 * nationality comes from the generated country list and stores one canonical
 * string from every locale, so a staff member's keyboard cannot invent a new
 * reporting bucket for Ucraïna.
 *
 * The LABELS are the wizard's, with two exceptions. The wizard asks "which
 * language do you want the app in?" and "do you have anyone in your care?",
 * because it is talking to her; this form is talking about her, so those two
 * carry field names instead. Everything else is a plain noun and is shared on
 * purpose.
 *
 * A team member without `participants.view_sensitive` reads no document
 * number, phone, address or postal code (RAPP-320). The form hides those four
 * inputs, says why, and validates with `profileEditWithoutSensitiveSchema`: the
 * document rule cannot judge a number she was never shown, so the database runs
 * it on the stored number and keeps the stored values, whatever the payload says.
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
import type { z } from 'zod';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import { getCountryOptions } from '@ramassa/shared/i18n/countries';
import type { ParticipantDetailRow } from '@ramassa/shared/participants';
import {
  buildUpdateOwnProfilePayload,
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  profileEditSchema,
  profileEditWithoutSensitiveSchema,
  profileFromRow,
  SHOE_SIZES,
  type ProfileEdit,
  type UpdateOwnProfilePayload,
} from '@ramassa/shared/schemas';

type ProfileEditInput = z.input<typeof profileEditSchema>;

const fullResolver = zodResolver(profileEditSchema);
const withoutSensitiveResolver = zodResolver(profileEditWithoutSensitiveSchema);

export interface ParticipantEditFormProps {
  readonly participant: ParticipantDetailRow;
  /** Holds `participants.view_sensitive`: shows and validates the four encrypted fields. */
  readonly canSeeSensitive: boolean;
  readonly onSubmit: (payload: UpdateOwnProfilePayload) => Promise<void>;
  readonly onCancel: () => void;
  /** Shown at the button when the write itself failed, not the validation. */
  readonly errorMessage?: string;
}

export function ParticipantEditForm({
  participant,
  canSeeSensitive,
  onSubmit,
  onCancel,
  errorMessage,
}: ParticipantEditFormProps) {
  const { t, i18n } = useTranslation(['participants', 'onboarding', 'profile', 'common']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const [isBlocked, setIsBlocked] = useState(false);

  const countryOptions = useMemo(
    () => getCountryOptions(locale as (typeof SUPPORTED_LANGUAGES)[number]),
    [locale],
  );

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    // Three generics, not one: the schema's INPUT (what the fields hold, with
    // the optional keys absent) is not its OUTPUT (what the RPC receives), and
    // collapsing them makes the resolver unassignable. Same shape as the
    // player-side editor, for the same reason.
  } = useForm<ProfileEditInput, unknown, ProfileEdit>({
    resolver: canSeeSensitive ? fullResolver : withoutSensitiveResolver,
    values: profileFromRow(participant) as ProfileEditInput,
  });

  const documentType = watch('documentType');
  const hasDependents = watch('hasDependents');

  const save = handleSubmit(
    async (edit) => {
      setIsBlocked(false);
      await onSubmit(buildUpdateOwnProfilePayload(edit));
    },
    // A rejected submit has to SAY something AT THE BUTTON. Every field error
    // renders beside its own field, which on a form this long is usually far
    // above the fold: pressing Save and watching nothing happen is how a working
    // button reads as a broken app.
    () => setIsBlocked(true),
  );

  return (
    <form onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-6">
      {canSeeSensitive ? null : (
        <p
          data-testid="participant-edit-sensitive-hidden"
          className="text-start text-sm text-muted-foreground"
        >
          {t('participants:profile.sensitiveHidden')}
        </p>
      )}
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
          errorMessage={errors.placeOfBirth ? t('onboarding:errorRequired') : undefined}
        />

        {/* A picker, never a text box: `nationality` feeds aggregate impact
            reporting, where one misplaced finger creates a whole new bucket. */}
        <SelectField
          control={control}
          name="nationality"
          label={t('onboarding:nationalityLabel')}
          options={countryOptions.map((country) => ({
            value: country.canonical,
            label: country.label,
          }))}
          errorMessage={errors.nationality ? t('onboarding:errorRequired') : undefined}
        />
        <SelectField
          control={control}
          name="preferredLanguage"
          label={t('profile:languageLabel')}
          options={SUPPORTED_LANGUAGES.map((language) => ({
            value: language,
            label: LANGUAGE_NATIVE_NAMES[language],
          }))}
        />

        <SelectField
          control={control}
          name="documentType"
          label={t('onboarding:documentTypeLabel')}
          options={DOCUMENT_TYPES.map((type) => ({
            value: type,
            label: t(`onboarding:documentType${type.charAt(0).toUpperCase()}${type.slice(1)}`),
          }))}
        />
        {/* "No document" is a first-class answer, so the number disappears
            rather than sitting there demanding something she does not have. */}
        {!canSeeSensitive || documentType === 'none' ? null : (
          <TextField
            control={control}
            name="documentNumber"
            label={t('onboarding:documentNumberLabel')}
            errorMessage={
              errors.documentNumber
                ? documentType === 'nie'
                  ? t('onboarding:errorNieFormat')
                  : t('onboarding:errorRequired')
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
          errorMessage={errors.referenceEntity ? t('onboarding:errorRequired') : undefined}
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
          options={[
            { value: 'true', label: t('onboarding:yesOption') },
            { value: 'false', label: t('onboarding:noOption') },
          ]}
          toFieldValue={(value) => value === 'true'}
          fromFieldValue={(value) => String(value)}
        />
        {hasDependents ? (
          <SelectField
            control={control}
            name="numDependents"
            label={t('onboarding:numDependentsLabel')}
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
          options={CLOTHING_SIZES.map((size) => ({ value: size, label: size }))}
        />
        <SelectField
          control={control}
          name="shoeSize"
          label={t('onboarding:shoeSizeLabel')}
          options={SHOE_SIZES.map((size) => ({ value: size, label: size }))}
        />
        <SelectField
          control={control}
          name="mediaConsent"
          label={t('profile:fieldMediaConsent')}
          options={[
            { value: 'true', label: t('onboarding:yesOption') },
            { value: 'false', label: t('onboarding:noOption') },
          ]}
          toFieldValue={(value) => value === 'true'}
          fromFieldValue={(value) => String(value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {t('profile:saveAction')}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={onCancel}>
          {t('profile:cancelAction')}
        </Button>
        {/* Rendered next to the button, and announced: on a form this long the
            field errors are off-screen at the moment they matter. */}
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
