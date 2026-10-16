import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { getCountryOptions } from '@ramassa/shared/i18n/countries';
import { getMunicipalityOptions } from '@ramassa/shared/i18n/municipalities';
import {
  createReferral,
  createReferralSchema,
  DOCUMENTATION_STATUSES,
  type CreateReferral,
  type CreateReferralInput,
} from '@ramassa/shared/referrals';
import {
  APPLICANT_STATUSES,
  CHILDCARE_NEEDS,
  DOCUMENT_TYPES,
  SEASON_NUMBERS,
  SPECIFIC_NEEDS_MAX_LENGTH,
} from '@ramassa/shared/schemas';

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

const SELECT_CLASS = 'h-11 rounded-lg border border-input bg-background px-3 text-sm';

function Labelled({
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
      {hint === undefined ? null : (
        <p className="text-start text-xs text-muted-foreground">{hint}</p>
      )}
      {errorMessage === undefined ? null : (
        <p className="text-start text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}

export interface ReferralFormProps {
  /** The organization's partner entities, offered as other supporting entities (RAPP-303). */
  readonly entityNames?: readonly string[];
}

export function ReferralForm({ entityNames = [] }: ReferralFormProps) {
  const { t, i18n } = useTranslation(['referrals', 'onboarding']);
  const locale = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const countries = useMemo(() => getCountryOptions(locale), [locale]);
  const municipalities = useMemo(() => getMunicipalityOptions(locale), [locale]);
  const [otherEntities, setOtherEntities] = useState('');
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateReferralInput, unknown, CreateReferral>({
    resolver: zodResolver(createReferralSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      documentationStatus: 'in_progress',
      notes: '',
      dateOfBirth: '',
      nationality: '',
      documentType: '' as never,
      documentNumber: '',
      city: '',
      applicantStatus: '' as never,
      supportingEntities: [],
      referenceContactName: '',
      seasonNumber: '' as never,
      childcareNeed: '' as never,
      specificNeeds: '',
      consentConfirmed: false as never,
    },
  });
  const documentType = watch('documentType') as string | null | undefined;

  const submit = handleSubmit(async (parsed) => {
    setFailed(false);
    // "Other" entities typed as a comma-separated list join the ticked ones.
    const typed = otherEntities
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const input: CreateReferral = {
      ...parsed,
      supportingEntities: [...new Set([...parsed.supportingEntities, ...typed])],
    };
    const result = await safeAsync(() => createReferral(supabase, input), {
      context: { operation: 'entity-referral-create' },
    });
    if (!result.ok) {
      setFailed(true);
      return;
    }
    await navigate({
      to: '/portal/referrals/$referralId',
      params: { referralId: result.value },
    });
  });

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header>
        <Link
          to="/portal/referrals"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('back')}
        </Link>
        <h1 className="mt-3 text-start text-2xl font-semibold">{t('formTitle')}</h1>
        <p className="mt-1 text-start text-sm text-muted-foreground">{t('formIntro')}</p>
      </header>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void submit(event)}
        data-testid="referral-form"
      >
        <Controller
          name="firstName"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              id="referral-first-name"
              label={t('firstName')}
              errorMessage={errors.firstName ? t('requiredError') : undefined}
            />
          )}
        />
        <Controller
          name="lastName"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              id="referral-last-name"
              label={t('lastName')}
              errorMessage={errors.lastName ? t('requiredError') : undefined}
            />
          )}
        />
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              value={field.value ?? ''}
              id="referral-phone"
              type="tel"
              label={t('phone')}
            />
          )}
        />
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              value={field.value ?? ''}
              id="referral-email"
              type="email"
              label={t('email')}
              errorMessage={errors.email ? t('emailError') : undefined}
            />
          )}
        />
        <Controller
          name="documentationStatus"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="referral-documentation" className="text-start text-sm font-medium">
                {t('documentationLabel')}
              </label>
              <select
                {...field}
                id="referral-documentation"
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {DOCUMENTATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`documentation.${status}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        />
        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="referral-notes" className="text-start text-sm font-medium">
                {t('notes')}
              </label>
              <Textarea {...field} value={field.value ?? ''} id="referral-notes" rows={5} />
            </div>
          )}
        />

        <div className="mt-2 flex flex-col gap-1">
          <h2 className="text-start text-lg font-semibold">{t('onboarding:seasonSectionTitle')}</h2>
          <p className="text-start text-sm text-muted-foreground">
            {t('referrals:seasonSectionIntro')}
          </p>
        </div>
        <Controller
          name="dateOfBirth"
          control={control}
          render={({ field }) => (
            <Labelled
              id="referral-date-of-birth"
              label={t('onboarding:dateOfBirthLabel')}
              errorMessage={errors.dateOfBirth ? t('referrals:dateOfBirthError') : undefined}
            >
              <input
                {...field}
                value={field.value ?? ''}
                id="referral-date-of-birth"
                type="date"
                className={SELECT_CLASS}
              />
            </Labelled>
          )}
        />
        <Controller
          name="nationality"
          control={control}
          render={({ field }) => (
            <Labelled id="referral-nationality" label={t('onboarding:nationalityLabel')}>
              <select
                {...field}
                value={field.value ?? ''}
                id="referral-nationality"
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.canonical}>
                    {country.label}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
        />
        <Controller
          name="documentType"
          control={control}
          render={({ field }) => (
            <Labelled id="referral-document-type" label={t('onboarding:documentTypeLabel')}>
              <select
                {...field}
                value={(field.value as string | null | undefined) ?? ''}
                id="referral-document-type"
                className={SELECT_CLASS}
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
        {documentType === undefined ||
        documentType === null ||
        documentType === '' ||
        documentType === 'none' ? null : (
          <Controller
            name="documentNumber"
            control={control}
            render={({ field }) => (
              <AdminAuthField
                {...field}
                value={field.value ?? ''}
                id="referral-document-number"
                label={t('onboarding:documentNumberLabel')}
                errorMessage={
                  errors.documentNumber ? t('referrals:documentNumberError') : undefined
                }
              />
            )}
          />
        )}
        <Controller
          name="city"
          control={control}
          render={({ field }) => (
            <Labelled id="referral-city" label={t('onboarding:cityLabel')}>
              <select
                {...field}
                value={field.value ?? ''}
                id="referral-city"
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {municipalities.map((municipality) => (
                  <option key={municipality.code} value={municipality.canonical}>
                    {municipality.label}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
        />
        <Controller
          name="applicantStatus"
          control={control}
          render={({ field }) => (
            <Labelled id="referral-applicant-status" label={t('onboarding:applicantStatusLabel')}>
              <select
                {...field}
                value={(field.value as string | null | undefined) ?? ''}
                id="referral-applicant-status"
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {APPLICANT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(APPLICANT_STATUS_KEYS[status])}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
        />
        <Controller
          name="supportingEntities"
          control={control}
          render={({ field }) => {
            const chosen = (field.value ?? []) as string[];
            return (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-start text-sm font-medium">
                  {t('onboarding:supportingEntitiesLabel')}
                </legend>
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
                  id="referral-supporting-entities-other"
                  label={t('onboarding:supportingEntitiesOtherLabel')}
                  value={otherEntities}
                  onChange={(event) => setOtherEntities(event.target.value)}
                />
              </fieldset>
            );
          }}
        />
        <Controller
          name="referenceContactName"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              value={field.value ?? ''}
              id="referral-contact-name"
              label={t('onboarding:referenceContactNameLabel')}
            />
          )}
        />
        <Controller
          name="seasonNumber"
          control={control}
          render={({ field }) => (
            <Labelled id="referral-season-number" label={t('onboarding:seasonNumberLabel')}>
              <select
                {...field}
                value={String(field.value ?? '')}
                id="referral-season-number"
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {SEASON_NUMBERS.map((season) => (
                  <option key={season} value={season}>
                    {t(`onboarding:seasonNumber${season}`)}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
        />
        <Controller
          name="childcareNeed"
          control={control}
          render={({ field }) => (
            <Labelled id="referral-childcare" label={t('onboarding:childcareNeedLabel')}>
              <select
                {...field}
                value={(field.value as string | null | undefined) ?? ''}
                id="referral-childcare"
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {CHILDCARE_NEEDS.map((need) => (
                  <option key={need} value={need}>
                    {t(CHILDCARE_KEYS[need])}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
        />
        <Controller
          name="specificNeeds"
          control={control}
          render={({ field }) => (
            <Labelled
              id="referral-specific-needs"
              label={t('onboarding:specificNeedsLabel')}
              hint={t('onboarding:specificNeedsHint')}
            >
              <Textarea
                {...field}
                value={field.value ?? ''}
                id="referral-specific-needs"
                rows={4}
                maxLength={SPECIFIC_NEEDS_MAX_LENGTH}
              />
            </Labelled>
          )}
        />
        <Controller
          name="consentConfirmed"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5 rounded-lg border p-3">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  id="referral-consent"
                  type="checkbox"
                  checked={field.value === true}
                  onChange={(event) => field.onChange(event.target.checked)}
                  aria-invalid={errors.consentConfirmed !== undefined}
                />
                <span>{t('referrals:consentLabel')}</span>
              </label>
              {errors.consentConfirmed ? (
                <p className="text-start text-sm text-destructive">
                  {t('referrals:consentRequired')}
                </p>
              ) : null}
              <p className="text-start text-xs text-muted-foreground">
                {t('referrals:privacyNote')}
              </p>
            </div>
          )}
        />
        {failed ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('saveError')}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={isSubmitting} data-testid="referral-submit">
          {t('save')}
        </Button>
      </form>
    </section>
  );
}
