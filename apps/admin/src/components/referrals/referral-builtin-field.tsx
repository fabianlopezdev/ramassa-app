/**
 * One built-in field of the entity referral form (RAPP-303, RAPP-652), with
 * its own control: a country or municipality list, the app's choices, a
 * document type with its number. The label is the placement's wording for
 * the entity, else the field's own name, in the form's language; an asterisk
 * marks a field the form requires.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { Textarea } from '@/components/ui/textarea';
import { useMemo } from 'react';
import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getCountryOptions } from '@ramassa/shared/i18n/countries';
import { getMunicipalityOptions } from '@ramassa/shared/i18n/municipalities';
import { placementWordingIn, type EntityFormItem } from '@ramassa/shared/intake-builder';
import type { CreateReferral, CreateReferralInput } from '@ramassa/shared/referrals';
import {
  APPLICANT_STATUSES,
  CHILDCARE_NEEDS,
  DOCUMENT_TYPES,
  SPECIFIC_NEEDS_MAX_LENGTH,
} from '@ramassa/shared/schemas';
import type { LanguageCode } from '@ramassa/shared/schemas';

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

const DOCUMENT_TYPE_KEYS = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
} as const;

/** Every control of the form has this height and look. */
export const REFERRAL_CONTROL_CLASS =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm';

export type ReferralControl = Control<CreateReferralInput, unknown, CreateReferral>;

export function Labelled({
  id,
  label,
  hint,
  errorMessage,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly errorMessage?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-start text-sm font-medium">
        {label}
      </label>
      {children}
      {hint === undefined || hint === '' ? null : (
        <p className="text-start text-xs text-muted-foreground">{hint}</p>
      )}
      {errorMessage === undefined ? null : (
        <p className="text-start text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}

export interface ReferralBuiltinFieldProps {
  readonly item: Extract<EntityFormItem, { kind: 'builtin' }>;
  readonly control: ReferralControl;
  readonly errors: FieldErrors<CreateReferralInput>;
  /** Left empty although the form requires it. */
  readonly isMissing: boolean;
  readonly language: LanguageCode;
  /** `referral` on the portal; the editor's preview uses its own. */
  readonly idPrefix: string;
  /** The organization's partner entities, offered as other supporting entities. */
  readonly entityNames: readonly string[];
  readonly otherEntities: string;
  readonly onOtherEntitiesChange: (value: string) => void;
  readonly documentType: string | null | undefined;
}

export function ReferralBuiltinField({
  item,
  control,
  errors,
  isMissing,
  language,
  idPrefix,
  entityNames,
  otherEntities,
  onOtherEntitiesChange,
  documentType,
}: ReferralBuiltinFieldProps) {
  const { t } = useTranslation(['referrals', 'onboarding'], { lng: language });
  const countries = useMemo(() => getCountryOptions(language), [language]);
  const municipalities = useMemo(() => getMunicipalityOptions(language), [language]);
  const wording = placementWordingIn(item.placement, item.field, language);
  const isRequired = item.placement.required;
  const label = `${wording.label}${isRequired ? ' *' : ''}`;
  const missing = isMissing ? t('referrals:requiredError') : undefined;
  const id = (name: string) => `${idPrefix}-${name}`;

  switch (item.key) {
    case 'first_name':
    case 'last_name':
    case 'phone': {
      const name =
        item.key === 'first_name' ? 'firstName' : item.key === 'last_name' ? 'lastName' : 'phone';
      const fieldId =
        item.key === 'phone'
          ? id('phone')
          : id(item.key === 'first_name' ? 'first-name' : 'last-name');
      return (
        <Controller
          name={name}
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              value={field.value ?? ''}
              id={fieldId}
              type={item.key === 'phone' ? 'tel' : 'text'}
              label={label}
              required={isRequired}
              errorMessage={errors[name] ? t('referrals:requiredError') : missing}
            />
          )}
        />
      );
    }
    case 'date_of_birth':
      return (
        <Controller
          name="dateOfBirth"
          control={control}
          render={({ field }) => (
            <Labelled
              id={id('date-of-birth')}
              label={label}
              hint={wording.help}
              errorMessage={errors.dateOfBirth ? t('referrals:dateOfBirthError') : missing}
            >
              <input
                {...field}
                value={field.value ?? ''}
                id={id('date-of-birth')}
                type="date"
                required={isRequired}
                className={REFERRAL_CONTROL_CLASS}
              />
            </Labelled>
          )}
        />
      );
    case 'nationality':
    case 'city': {
      const name = item.key;
      const options = name === 'nationality' ? countries : municipalities;
      return (
        <Controller
          name={name}
          control={control}
          render={({ field }) => (
            <Labelled id={id(name)} label={label} hint={wording.help} errorMessage={missing}>
              <select
                {...field}
                value={field.value ?? ''}
                id={id(name)}
                required={isRequired}
                className={REFERRAL_CONTROL_CLASS}
              >
                <option value="">—</option>
                {options.map((option) => (
                  <option key={option.code} value={option.canonical}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
        />
      );
    }
    case 'document':
      return (
        <div className="flex flex-col gap-4">
          <Controller
            name="documentType"
            control={control}
            render={({ field }) => (
              <Labelled
                id={id('document-type')}
                label={label}
                hint={wording.help}
                errorMessage={missing}
              >
                <select
                  {...field}
                  value={(field.value as string | null | undefined) ?? ''}
                  id={id('document-type')}
                  required={isRequired}
                  className={REFERRAL_CONTROL_CLASS}
                >
                  <option value="">—</option>
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(DOCUMENT_TYPE_KEYS[type])}
                    </option>
                  ))}
                </select>
              </Labelled>
            )}
          />
          {documentType == null || documentType === '' || documentType === 'none' ? null : (
            <Controller
              name="documentNumber"
              control={control}
              render={({ field }) => (
                <AdminAuthField
                  {...field}
                  value={field.value ?? ''}
                  id={id('document-number')}
                  label={t('onboarding:documentNumberLabel')}
                  errorMessage={
                    errors.documentNumber ? t('referrals:documentNumberError') : undefined
                  }
                />
              )}
            />
          )}
        </div>
      );
    case 'applicant_status':
    case 'childcare_need': {
      const isStatus = item.key === 'applicant_status';
      const name = isStatus ? 'applicantStatus' : 'childcareNeed';
      const fieldId = id(isStatus ? 'applicant-status' : 'childcare');
      const choices = isStatus
        ? APPLICANT_STATUSES.map((value) => [value, t(APPLICANT_STATUS_KEYS[value])] as const)
        : CHILDCARE_NEEDS.map((value) => [value, t(CHILDCARE_KEYS[value])] as const);
      return (
        <Controller
          name={name}
          control={control}
          render={({ field }) => (
            <Labelled id={fieldId} label={label} hint={wording.help} errorMessage={missing}>
              <select
                {...field}
                value={(field.value as string | null | undefined) ?? ''}
                id={fieldId}
                required={isRequired}
                className={REFERRAL_CONTROL_CLASS}
              >
                <option value="">—</option>
                {choices.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
        />
      );
    }
    case 'supporting_entities':
      return (
        <Controller
          name="supportingEntities"
          control={control}
          render={({ field }) => {
            const chosen = (field.value ?? []) as string[];
            return (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-start text-sm font-medium">{label}</legend>
                {entityNames.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.includes(name)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked
                            ? [...chosen, name]
                            : chosen.filter((entry) => entry !== name),
                        )
                      }
                    />
                    <span>{name}</span>
                  </label>
                ))}
                <AdminAuthField
                  id={id('supporting-entities-other')}
                  label={t('onboarding:supportingEntitiesOtherLabel')}
                  value={otherEntities}
                  onChange={(event) => onOtherEntitiesChange(event.target.value)}
                />
                {missing === undefined ? null : (
                  <p className="text-start text-sm text-destructive">{missing}</p>
                )}
              </fieldset>
            );
          }}
        />
      );
    case 'reference_contact_name':
      return (
        <Controller
          name="referenceContactName"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              value={field.value ?? ''}
              id={id('contact-name')}
              label={label}
              required={isRequired}
              errorMessage={missing}
            />
          )}
        />
      );
    case 'specific_needs':
      return (
        <Controller
          name="specificNeeds"
          control={control}
          render={({ field }) => (
            <Labelled
              id={id('specific-needs')}
              label={label}
              hint={wording.help === '' ? t('onboarding:specificNeedsHint') : wording.help}
              errorMessage={missing}
            >
              <Textarea
                {...field}
                value={field.value ?? ''}
                id={id('specific-needs')}
                rows={4}
                required={isRequired}
                maxLength={SPECIFIC_NEEDS_MAX_LENGTH}
              />
            </Labelled>
          )}
        />
      );
  }
}
