/**
 * The season registration answers as read-only rows (RAPP-303), for her own
 * profile and the wizard summary. She sees all five: they are hers. An answer
 * nobody gave reads as "not provided".
 */

import { ProfileRow } from '@/components/profile/profile-section';
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

export function SeasonAnswerRows({
  profile,
  emptyLabel,
  showSeasonNumber = true,
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
  >;
  readonly emptyLabel: string;
}) {
  const { t } = useTranslation(['onboarding']);
  return (
    <>
      <ProfileRow
        label={t('onboarding:applicantStatusLabel')}
        value={
          profile.applicant_status == null
            ? emptyLabel
            : t(APPLICANT_STATUS_KEYS[profile.applicant_status])
        }
      />
      <ProfileRow
        label={t('onboarding:supportingEntitiesLabel')}
        value={
          profile.supporting_entities == null || profile.supporting_entities.length === 0
            ? emptyLabel
            : profile.supporting_entities.join(', ')
        }
      />
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
      <ProfileRow
        label={t('onboarding:childcareNeedLabel')}
        value={
          profile.childcare_need == null ? emptyLabel : t(CHILDCARE_KEYS[profile.childcare_need])
        }
      />
      <ProfileRow
        label={t('onboarding:specificNeedsLabel')}
        value={
          profile.specific_needs == null || profile.specific_needs === ''
            ? emptyLabel
            : profile.specific_needs
        }
      />
    </>
  );
}
