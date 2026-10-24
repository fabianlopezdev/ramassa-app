/**
 * The fields of the entity referral form (RAPP-652): the Fitxa fields staff
 * placed on it, in their order, then the referral's own (her address, her
 * documentation, her season, the entity's notes) and her consent. The portal
 * fills it in; the staff editor shows it read-only as the entity sees it.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { CustomAnswerInput } from '@/components/intake/custom-answer-fields';
import { Textarea } from '@/components/ui/textarea';
import { Controller, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { EntityFormItem } from '@ramassa/shared/intake-builder';
import { DOCUMENTATION_STATUSES, type CreateReferralInput } from '@ramassa/shared/referrals';
import { SEASON_NUMBERS, type LanguageCode } from '@ramassa/shared/schemas';
import {
  Labelled,
  REFERRAL_CONTROL_CLASS,
  ReferralBuiltinField,
  type ReferralControl,
} from './referral-builtin-field';

export interface ReferralFormFieldsProps {
  readonly items: readonly EntityFormItem[];
  readonly control: ReferralControl;
  readonly errors: FieldErrors<CreateReferralInput>;
  readonly language: LanguageCode;
  readonly idPrefix: string;
  readonly entityNames: readonly string[];
  readonly otherEntities: string;
  readonly onOtherEntitiesChange: (value: string) => void;
  readonly documentType: string | null | undefined;
  /** {field id: message} for Ramassà answers that do not fit. */
  readonly customErrors: Readonly<Record<string, string>>;
  /** The required fields left empty, by field id. */
  readonly missing: ReadonlySet<string>;
}

export function ReferralFormFields({
  items,
  control,
  errors,
  language,
  idPrefix,
  entityNames,
  otherEntities,
  onOtherEntitiesChange,
  documentType,
  customErrors,
  missing,
}: ReferralFormFieldsProps) {
  const { t } = useTranslation(['referrals', 'onboarding'], { lng: language });
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      {items.map((item) =>
        item.kind === 'builtin' ? (
          <ReferralBuiltinField
            key={item.placement.id}
            item={item}
            control={control}
            errors={errors}
            isMissing={missing.has(item.field.id)}
            language={language}
            idPrefix={idPrefix}
            entityNames={entityNames}
            otherEntities={otherEntities}
            onOtherEntitiesChange={onOtherEntitiesChange}
            documentType={documentType}
          />
        ) : (
          <CustomAnswerInput
            key={item.placement.id}
            question={item.question}
            value={undefined}
            prefix={id('field')}
            language={language}
            isRequired={item.placement.required}
            inputClassName={REFERRAL_CONTROL_CLASS}
            error={
              customErrors[item.field.id] ??
              (missing.has(item.field.id) ? t('referrals:requiredError') : undefined)
            }
          />
        ),
      )}

      <Controller
        name="email"
        control={control}
        render={({ field }) => (
          <AdminAuthField
            {...field}
            value={field.value ?? ''}
            id={id('email')}
            type="email"
            label={t('referrals:email')}
            errorMessage={errors.email ? t('referrals:emailError') : undefined}
          />
        )}
      />
      <Controller
        name="documentationStatus"
        control={control}
        render={({ field }) => (
          <Labelled id={id('documentation')} label={t('referrals:documentationLabel')}>
            <select {...field} id={id('documentation')} className={REFERRAL_CONTROL_CLASS}>
              {DOCUMENTATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`referrals:documentation.${status}`)}
                </option>
              ))}
            </select>
          </Labelled>
        )}
      />
      <Controller
        name="seasonNumber"
        control={control}
        render={({ field }) => (
          <Labelled id={id('season-number')} label={t('onboarding:seasonNumberLabel')}>
            <select
              {...field}
              value={String(field.value ?? '')}
              id={id('season-number')}
              className={REFERRAL_CONTROL_CLASS}
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
        name="notes"
        control={control}
        render={({ field }) => (
          <Labelled id={id('notes')} label={t('referrals:notes')}>
            <Textarea {...field} value={field.value ?? ''} id={id('notes')} rows={5} />
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
                id={id('consent')}
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
            <p className="text-start text-xs text-muted-foreground">{t('referrals:privacyNote')}</p>
          </div>
        )}
      />
    </>
  );
}
