/**
 * The season registration answers as dashboard form fields (RAPP-303):
 * applicant status, other supporting entities, season, childcare and specific
 * needs. Used by the full edit form and by the prefill form of a woman who has
 * not joined. Applicant status and specific needs need
 * participants.view_sensitive; without it they are not rendered, and the
 * database ignores them anyway.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { SelectField, TextField } from '@/components/participants/participant-form-fields';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { APPLICANT_STATUSES, CHILDCARE_NEEDS, SEASON_NUMBERS } from '@ramassa/shared/schemas';

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

export interface SeasonAnswerFormFieldsProps<Values extends FieldValues, Output> {
  readonly control: Control<Values, unknown, Output>;
  readonly canSeeSensitive: boolean;
  readonly emptyLabel: string;
}

export function SeasonAnswerFormFields<Values extends FieldValues, Output>({
  control,
  canSeeSensitive,
  emptyLabel,
}: SeasonAnswerFormFieldsProps<Values, Output>) {
  const { t } = useTranslation(['onboarding']);
  const name = (field: string) => field as Path<Values>;
  return (
    <>
      {canSeeSensitive ? (
        <SelectField
          control={control}
          name={name('applicantStatus')}
          label={t('onboarding:applicantStatusLabel')}
          emptyLabel={emptyLabel}
          options={APPLICANT_STATUSES.map((status) => ({
            value: status,
            label: t(APPLICANT_STATUS_KEYS[status]),
          }))}
        />
      ) : null}
      {/* A comma-separated list: staff type the names the entity gave. */}
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
      <SelectField
        control={control}
        name={name('seasonNumber')}
        label={t('onboarding:seasonNumberLabel')}
        emptyLabel={emptyLabel}
        options={SEASON_NUMBERS.map((season) => ({
          value: String(season),
          label: t(`onboarding:seasonNumber${season}`),
        }))}
        toFieldValue={(value) => Number(value)}
        fromFieldValue={(value) => String(value)}
      />
      <SelectField
        control={control}
        name={name('childcareNeed')}
        label={t('onboarding:childcareNeedLabel')}
        emptyLabel={emptyLabel}
        options={CHILDCARE_NEEDS.map((need) => ({ value: need, label: t(CHILDCARE_KEYS[need]) }))}
      />
      {canSeeSensitive ? (
        <TextField
          control={control}
          name={name('specificNeeds')}
          label={t('onboarding:specificNeedsLabel')}
          placeholder={t('onboarding:specificNeedsHint')}
        />
      ) : null}
    </>
  );
}
