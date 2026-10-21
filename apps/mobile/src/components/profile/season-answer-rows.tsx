/**
 * The season registration answers as read-only rows (RAPP-303), for her own
 * profile and the wizard summary. She sees all five: they are hers. An answer
 * nobody gave reads as "not provided".
 *
 * The wizard summary passes staff's wording (RAPP-307) and leaves out the
 * questions staff removed.
 */

import { ProfileRow } from '@/components/profile/profile-section';
import type { BuiltinWording } from '@/lib/onboarding-intake-context';
import { useTranslation } from 'react-i18next';
import type { ProfileRow as ProfileRecord } from '@ramassa/shared/schemas';

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

export function SeasonAnswerRows({
  profile,
  emptyLabel,
  showSeasonNumber = true,
  wording,
  shows = () => true,
}: {
  /** Hidden in the wizard summary: the number is counted, not answered (RAPP-306). */
  readonly showSeasonNumber?: boolean;
  readonly profile: Pick<
    ProfileRecord,
    | 'applicant_status'
    | 'supporting_entities'
    | 'season_number'
    | 'childcare_need'
    | 'specific_needs'
  > & { readonly applicant_status_details?: string | null };
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
  return (
    <>
      {shows('applicant_status') ? (
        <ProfileRow
          label={label('applicant_status', t('onboarding:applicantStatusLabel'))}
          value={
            profile.applicant_status == null
              ? emptyLabel
              : optionLabel(
                  'applicant_status',
                  profile.applicant_status,
                  t(APPLICANT_STATUS_KEYS[profile.applicant_status]),
                )
          }
        />
      ) : null}
      {shows('applicant_status') &&
      profile.applicant_status === 'other' &&
      profile.applicant_status_details ? (
        <ProfileRow
          label={t('onboarding:otherSituationDetailsLabel')}
          value={profile.applicant_status_details}
        />
      ) : null}
      {shows('supporting_entities') ? (
        <ProfileRow
          label={label('supporting_entities', t('onboarding:supportingEntitiesLabel'))}
          value={
            profile.supporting_entities == null || profile.supporting_entities.length === 0
              ? emptyLabel
              : profile.supporting_entities.join(', ')
          }
        />
      ) : null}
      {showSeasonNumber ? (
        <ProfileRow
          label={t('onboarding:seasonNumberLabel')}
          value={
            profile.season_number == null
              ? emptyLabel
              : t(`onboarding:seasonNumber${profile.season_number}`)
          }
        />
      ) : null}
      {shows('childcare_need') ? (
        <ProfileRow
          label={label('childcare_need', t('onboarding:childcareNeedLabel'))}
          value={
            profile.childcare_need == null
              ? emptyLabel
              : optionLabel(
                  'childcare_need',
                  profile.childcare_need,
                  t(CHILDCARE_KEYS[profile.childcare_need]),
                )
          }
        />
      ) : null}
      {shows('specific_needs') ? (
        <ProfileRow
          label={label('specific_needs', t('onboarding:specificNeedsLabel'))}
          value={
            profile.specific_needs == null || profile.specific_needs === ''
              ? emptyLabel
              : profile.specific_needs
          }
        />
      ) : null}
    </>
  );
}
