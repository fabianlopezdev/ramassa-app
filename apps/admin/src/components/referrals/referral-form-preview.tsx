/**
 * The referral form as the entity sees it (RAPP-652), beside its editor: the
 * portal's own fields, read-only, in the language chosen above it, with the
 * wording staff are typing.
 */

import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import {
  entityFormItems,
  type FormBlock,
  type ProfileLayout,
} from '@ramassa/shared/intake-builder';
import type { CreateReferral, CreateReferralInput } from '@ramassa/shared/referrals';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { EMPTY_REFERRAL } from './referral-form';
import { ReferralFormFields } from './referral-form-fields';

const NOTHING_MISSING: ReadonlySet<string> = new Set();

export function ReferralFormPreview({
  layout,
  language,
  entityNames,
  blocks = [],
}: {
  readonly layout: ProfileLayout;
  readonly language: LanguageCode;
  readonly entityNames: readonly string[];
  /** The form's signature blocks (RAPP-690), the text being typed as typed. */
  readonly blocks?: readonly FormBlock[];
}) {
  const { t } = useTranslation('referrals', { lng: language });
  const { control, formState } = useForm<CreateReferralInput, unknown, CreateReferral>({
    defaultValues: EMPTY_REFERRAL,
  });
  return (
    <div
      dir={getLanguageDirection(language)}
      lang={language}
      className="flex w-full flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="referral-form-preview"
    >
      <p className="text-start text-lg font-semibold">{t('formTitle')}</p>
      <fieldset disabled className="flex min-w-0 flex-col gap-4">
        <ReferralFormFields
          items={entityFormItems(layout)}
          control={control}
          errors={formState.errors}
          language={language}
          idPrefix="referral-preview"
          entityNames={entityNames}
          otherEntities=""
          onOtherEntitiesChange={() => undefined}
          documentType={null}
          customErrors={{}}
          missing={NOTHING_MISSING}
          blocks={blocks}
        />
        <Button type="button" size="lg">
          {t('save')}
        </Button>
      </fieldset>
    </div>
  );
}
