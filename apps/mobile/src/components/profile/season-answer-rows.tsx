/**
 * The season registration answers as read-only rows (RAPP-303), for her own
 * profile and the wizard summary. She sees all five: they are hers. An answer
 * nobody gave reads as "not provided".
 *
 * The wizard summary passes staff's wording (RAPP-307) and leaves out the
 * questions staff removed.
 */

import { ProfileRow, type ProfileRowProps } from '@/components/profile/profile-section';
import type { BuiltinWording } from '@/lib/onboarding-intake-context';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSupportNeeds } from '@ramassa/shared/schemas';

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

type SeasonQuestion =
  'applicant_status' | 'supporting_entities' | 'childcare_need' | 'specific_needs';

/** Her season answers by form name (RAPP-663): read by field, an unknown key reads as none. */
export interface SeasonAnswerValues {
  readonly applicantStatus?: string | null;
  readonly applicantStatusDetails?: string | null;
  readonly supportingEntities?: readonly string[] | null;
  readonly seasonNumber?: number | null;
  readonly childcareNeed?: string | null;
  readonly specificNeeds?: string | null;
}

function keyed<Key extends string>(
  value: string | null | undefined,
  keys: Readonly<Record<Key, string>>,
): Key | null {
  return value !== null && value !== undefined && Object.hasOwn(keys, value)
    ? (value as Key)
    : null;
}

export function SeasonAnswerRows({
  answers,
  emptyLabel,
  showSeasonNumber = true,
  wording,
  shows = () => true,
  rowComponent: Row = ProfileRow,
}: {
  /** Hidden in the wizard summary: the number is counted, not answered (RAPP-306). */
  readonly showSeasonNumber?: boolean;
  readonly rowComponent?: ComponentType<ProfileRowProps>;
  readonly answers: SeasonAnswerValues;
  readonly emptyLabel: string;
  /** Staff's wording of these questions (RAPP-307); the app's own without it. */
  readonly wording?: BuiltinWording;
  /** Which rows to show; the wizard summary leaves out the ones staff removed. */
  readonly shows?: (question: SeasonQuestion) => boolean;
}) {
  const { t } = useTranslation(['onboarding']);
  const label = (question: SeasonQuestion, appLabel: string) =>
    wording?.label(question, appLabel) ?? appLabel;
  // A relabelled choice reads in staff's words; her stored value is always kept.
  const optionLabel = (question: SeasonQuestion, value: string, appLabel: string) =>
    wording?.options(question, [{ value, label: appLabel }], value)[0]?.label ?? appLabel;
  const applicantStatus = keyed(answers.applicantStatus, APPLICANT_STATUS_KEYS);
  const childcareNeed = keyed(answers.childcareNeed, CHILDCARE_KEYS);
  return (
    <>
      {shows('applicant_status') ? (
        <Row
          icon="person"
          label={label('applicant_status', t('onboarding:applicantStatusLabel'))}
          value={
            applicantStatus === null
              ? emptyLabel
              : optionLabel(
                  'applicant_status',
                  applicantStatus,
                  t(APPLICANT_STATUS_KEYS[applicantStatus]),
                )
          }
        />
      ) : null}
      {shows('applicant_status') &&
      applicantStatus === 'other' &&
      answers.applicantStatusDetails ? (
        <Row
          label={t('onboarding:otherSituationDetailsLabel')}
          value={answers.applicantStatusDetails}
        />
      ) : null}
      {shows('supporting_entities') ? (
        <Row
          icon="entity"
          label={label('supporting_entities', t('onboarding:supportingEntitiesLabel'))}
          value={
            answers.supportingEntities == null || answers.supportingEntities.length === 0
              ? emptyLabel
              : answers.supportingEntities.join(', ')
          }
        />
      ) : null}
      {showSeasonNumber ? (
        <Row
          icon="calendar"
          label={t('onboarding:seasonNumberLabel')}
          value={
            answers.seasonNumber == null
              ? emptyLabel
              : t(`onboarding:seasonNumber${answers.seasonNumber}`)
          }
        />
      ) : null}
      {shows('childcare_need') ? (
        <Row
          icon="people"
          label={label('childcare_need', t('onboarding:childcareNeedLabel'))}
          value={
            childcareNeed === null
              ? emptyLabel
              : optionLabel('childcare_need', childcareNeed, t(CHILDCARE_KEYS[childcareNeed]))
          }
        />
      ) : null}
      {shows('specific_needs') ? (
        <Row
          icon="support"
          label={label('specific_needs', t('onboarding:specificNeedsLabel'))}
          value={
            answers.specificNeeds == null || answers.specificNeeds === ''
              ? emptyLabel
              : formatSupportNeeds(answers.specificNeeds, t)
          }
        />
      ) : null}
    </>
  );
}
