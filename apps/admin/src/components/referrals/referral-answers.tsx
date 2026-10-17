/**
 * The season registration answers an entity gave on a referral (RAPP-303),
 * read-only. Staff see them before accepting, because accepting fills her
 * record with them; the sending entity sees what it sent while the referral is
 * pending. Staff without participants.view_sensitive receive the answers
 * without applicant status, specific needs and the document number, so those
 * rows simply do not appear.
 */

import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { countryLabelForCanonical } from '@ramassa/shared/i18n/countries';
import { municipalityLabelForCanonical } from '@ramassa/shared/i18n/municipalities';
import type { ReferralAnswers } from '@ramassa/shared/referrals';

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

export function ReferralAnswersList({ answers }: { readonly answers: ReferralAnswers }) {
  const { t, i18n } = useTranslation(['onboarding']);
  const locale = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const rows: { readonly label: string; readonly value: string }[] = [];
  const add = (label: string, value: string | null) => {
    if (value !== null && value !== '') rows.push({ label, value });
  };

  add(
    t('onboarding:dateOfBirthLabel'),
    answers.dateOfBirth === null ? null : new Date(answers.dateOfBirth).toLocaleDateString(locale),
  );
  add(
    t('onboarding:nationalityLabel'),
    answers.nationality === null
      ? null
      : (countryLabelForCanonical(answers.nationality, locale) ?? answers.nationality),
  );
  add(
    t('onboarding:documentTypeLabel'),
    answers.documentType === null ? null : t(DOCUMENT_TYPE_KEYS[answers.documentType]),
  );
  add(t('onboarding:documentNumberLabel'), answers.documentNumber);
  add(
    t('onboarding:cityLabel'),
    answers.city === null
      ? null
      : (municipalityLabelForCanonical(answers.city, locale) ?? answers.city),
  );
  add(
    t('onboarding:applicantStatusLabel'),
    answers.applicantStatus === null ? null : t(APPLICANT_STATUS_KEYS[answers.applicantStatus]),
  );
  add(
    t('onboarding:supportingEntitiesLabel'),
    answers.supportingEntities.length === 0 ? null : answers.supportingEntities.join(', '),
  );
  add(t('onboarding:referenceContactNameLabel'), answers.referenceContactName);
  add(
    t('onboarding:seasonNumberLabel'),
    answers.seasonNumber === null ? null : t(`onboarding:seasonNumber${answers.seasonNumber}`),
  );
  add(
    t('onboarding:childcareNeedLabel'),
    answers.childcareNeed === null ? null : t(CHILDCARE_KEYS[answers.childcareNeed]),
  );
  add(t('onboarding:specificNeedsLabel'), answers.specificNeeds);

  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2" data-testid="referral-answers">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col">
          <dt className="text-start text-xs text-muted-foreground">{row.label}</dt>
          <dd className="text-start text-sm">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
