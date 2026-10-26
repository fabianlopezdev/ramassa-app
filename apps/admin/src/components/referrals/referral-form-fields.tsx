/**
 * The fields of the entity referral form (RAPP-652): the Fitxa fields staff
 * placed on it, in their order, then the referral's own (her address, her
 * documentation, her season, the entity's notes) and her consent. The portal
 * fills it in; the staff editor shows it read-only as the entity sees it.
 * The form's signature blocks (RAPP-690) sit among the fields in their shared
 * order: the text to accept and a pad the entity person signs.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { WebSignaturePad } from '@/components/fields/signature-pad';
import { CustomAnswerInput } from '@/components/intake/custom-answer-fields';
import { Textarea } from '@/components/ui/textarea';
import { Controller, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import {
  formBlockText,
  type EntityFormItem,
  type FormBlock,
  type FormSignatureDrafts,
} from '@ramassa/shared/intake-builder';
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
  /** The form's signature blocks (RAPP-690), each required. */
  readonly blocks?: readonly FormBlock[];
  /** The strokes drawn on each block, by block id. */
  readonly signatures?: FormSignatureDrafts;
  readonly onSignatureChange?: (blockId: string, strokes: SignatureStrokes | null) => void;
  /** The blocks left unsigned when the form was sent. */
  readonly unsigned?: ReadonlySet<string>;
}

/** The fields and the blocks in the order they share, a field first on a tie. */
function withBlocks(
  items: readonly EntityFormItem[],
  blocks: readonly FormBlock[],
): readonly (EntityFormItem | FormBlock)[] {
  const left = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const shown: (EntityFormItem | FormBlock)[] = [];
  for (const item of items) {
    while (left.length > 0 && (left[0]?.sortOrder ?? 0) < item.placement.sortOrder) {
      shown.push(left.shift() as FormBlock);
    }
    shown.push(item);
  }
  return [...shown, ...left];
}

function isBlock(entry: EntityFormItem | FormBlock): entry is FormBlock {
  return 'body' in entry;
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
  blocks = [],
  signatures = {},
  onSignatureChange,
  unsigned,
}: ReferralFormFieldsProps) {
  const { t } = useTranslation(['referrals', 'onboarding'], { lng: language });
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      {withBlocks(items, blocks).map((item) =>
        isBlock(item) ? (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-lg border p-3"
            data-testid={`referral-block-${item.id}`}
          >
            <p className="text-start text-sm font-medium whitespace-pre-line">
              {formBlockText(item, language).text}
            </p>
            {/* The editor's preview draws the pad and keeps it still. */}
            <div inert={onSignatureChange === undefined}>
              <WebSignaturePad
                strokes={signatures[item.id] ?? null}
                onChange={(next) => onSignatureChange?.(item.id, next)}
                label={t('referrals:signatureLabel')}
                prompt={t('referrals:signaturePrompt')}
                clearLabel={t('referrals:signatureClear')}
                isInvalid={unsigned?.has(item.id) === true}
                testId={`referral-block-${item.id}-pad`}
              />
            </div>
            {unsigned?.has(item.id) === true ? (
              <p className="text-start text-sm text-destructive">
                {t('referrals:signatureMissing')}
              </p>
            ) : null}
          </div>
        ) : item.kind === 'builtin' ? (
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
