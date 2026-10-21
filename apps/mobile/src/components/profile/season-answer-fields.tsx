/**
 * The season registration answers (RAPP-303): applicant status, other
 * entities that support her, which season this is, childcare and specific
 * needs. Every one is optional, so tapping a chosen chip again clears it.
 *
 * Used by the entity's referral form, her own profile edit and the staff
 * record edit. Applicant status and specific needs are sensitive: a screen
 * without participants.view_sensitive passes `showSensitive={false}` and the
 * two never render.
 *
 * Her wizard and re-registration pass staff's wording (RAPP-307): reworded
 * questions, help lines, and relabelled or hidden choices.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { OptionChip } from '@/components/onboarding/option-chip';
import { QuestionHelp } from '@/components/onboarding/question-help';
import type { BuiltinWording } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  APPLICANT_STATUSES,
  CHILDCARE_NEEDS,
  SEASON_NUMBERS,
  SPECIFIC_NEEDS_MAX_LENGTH,
  type ApplicantStatus,
  type ChildcareNeed,
  type SeasonNumber,
} from '@ramassa/shared/schemas';
import { SupportingEntitiesField } from './supporting-entities-field';

export interface SeasonAnswers {
  readonly applicantStatus: ApplicantStatus | null;
  readonly supportingEntities: readonly string[];
  readonly seasonNumber: SeasonNumber | null;
  readonly childcareNeed: ChildcareNeed | null;
  readonly specificNeeds: string;
}

type SeasonQuestion =
  'applicant_status' | 'supporting_entities' | 'childcare_need' | 'specific_needs';

export const EMPTY_SEASON_ANSWERS: SeasonAnswers = {
  applicantStatus: null,
  supportingEntities: [],
  seasonNumber: null,
  childcareNeed: null,
  specificNeeds: '',
};

const APPLICANT_STATUS_KEYS: Readonly<Record<ApplicantStatus, string>> = {
  asylum_seeker: 'onboarding:applicantStatusAsylumSeeker',
  refugee: 'onboarding:applicantStatusRefugee',
  migrant: 'onboarding:applicantStatusMigrant',
  other: 'onboarding:applicantStatusOther',
  prefer_not_to_say: 'onboarding:applicantStatusPreferNotToSay',
};

const CHILDCARE_KEYS: Readonly<Record<ChildcareNeed, string>> = {
  yes: 'onboarding:childcareNeedYes',
  no: 'onboarding:childcareNeedNo',
  maybe: 'onboarding:childcareNeedMaybe',
};

function Question({
  label,
  help = null,
  children,
}: {
  readonly label: string;
  readonly help?: string | null;
  readonly children: React.ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
        {label}
      </Text>
      <QuestionHelp text={help} />
      <View className="flex-row flex-wrap gap-sm">{children}</View>
    </View>
  );
}

export interface SeasonAnswerFieldsProps {
  readonly value: SeasonAnswers;
  readonly onChange: (patch: Partial<SeasonAnswers>) => void;
  /** The organization's partner entities, offered as choices. */
  readonly entityNames: readonly string[];
  /** False hides applicant status and specific needs (no participants.view_sensitive). */
  readonly showSensitive: boolean;
  /**
   * The season number is counted since RAPP-306: only the entity's referral
   * still asks "which year is this for her" (it sets her earlier seasons).
   */
  readonly showSeasonNumber?: boolean;
  /** Which questions to show; the wizard hides the ones already answered. */
  readonly shows?: (question: SeasonQuestion) => boolean;
  /** Staff's wording of these questions (RAPP-307); the app's own without it. */
  readonly wording?: BuiltinWording;
  readonly testIDPrefix: string;
  readonly applicantStatusPresentation?: 'chips' | 'picker';
}

export function SeasonAnswerFields({
  value,
  onChange,
  entityNames,
  showSensitive,
  showSeasonNumber = false,
  shows = () => true,
  wording,
  testIDPrefix,
  applicantStatusPresentation = 'chips',
}: SeasonAnswerFieldsProps) {
  const { t } = useTranslation(['onboarding']);
  const label = (question: SeasonQuestion, appLabel: string) =>
    wording?.label(question, appLabel) ?? appLabel;
  const help = (question: SeasonQuestion) => wording?.help(question) ?? null;
  const applicantStatuses = APPLICANT_STATUSES.map((status) => ({
    value: status,
    label: t(APPLICANT_STATUS_KEYS[status]),
  }));
  const childcareNeeds = CHILDCARE_NEEDS.map((need) => ({
    value: need,
    label: t(CHILDCARE_KEYS[need]),
  }));
  const fontClass = useLanguageFontClass();

  return (
    <View className="gap-lg" testID={`${testIDPrefix}-season`}>
      {showSensitive && shows('applicant_status') ? (
        <View
          className="gap-sm"
          accessibilityRole="radiogroup"
          accessibilityLabel={
            applicantStatusPresentation === 'picker'
              ? t('onboarding:currentSituationTitle')
              : label('applicant_status', t('onboarding:applicantStatusLabel'))
          }
        >
          {applicantStatusPresentation === 'picker' ? null : (
            <>
              <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
                {label('applicant_status', t('onboarding:applicantStatusLabel'))}
              </Text>
              <QuestionHelp text={help('applicant_status')} />
            </>
          )}
          <View
            className={
              applicantStatusPresentation === 'picker' ? 'gap-sm' : 'flex-row flex-wrap gap-sm'
            }
          >
            {(
              wording?.options('applicant_status', applicantStatuses, value.applicantStatus) ??
              applicantStatuses
            ).map(({ value: status, label: statusLabel }) =>
              applicantStatusPresentation === 'picker' ? (
                <SelectionChoiceCard
                  key={status}
                  testID={`${testIDPrefix}-applicant-status-${status}`}
                  label={statusLabel}
                  fontClass={fontClass}
                  isSelected={value.applicantStatus === status}
                  onPress={() =>
                    onChange({ applicantStatus: value.applicantStatus === status ? null : status })
                  }
                />
              ) : (
                <OptionChip
                  key={status}
                  label={statusLabel}
                  accessibilityHint={label(
                    'applicant_status',
                    t('onboarding:applicantStatusLabel'),
                  )}
                  isSelected={value.applicantStatus === status}
                  onPress={() =>
                    onChange({ applicantStatus: value.applicantStatus === status ? null : status })
                  }
                />
              ),
            )}
          </View>
        </View>
      ) : null}

      {shows('supporting_entities') ? (
        <SupportingEntitiesField
          testIDPrefix={testIDPrefix}
          value={value.supportingEntities}
          onChange={(supportingEntities) => onChange({ supportingEntities })}
          entityNames={entityNames}
          label={label('supporting_entities', t('onboarding:supportingEntitiesInstruction'))}
          help={help('supporting_entities')}
        />
      ) : null}

      {showSeasonNumber ? (
        <Question label={t('onboarding:seasonNumberLabel')}>
          {SEASON_NUMBERS.map((season) => (
            <OptionChip
              key={season}
              label={t(`onboarding:seasonNumber${season}`)}
              accessibilityHint={t('onboarding:seasonNumberLabel')}
              isSelected={value.seasonNumber === season}
              onPress={() =>
                onChange({ seasonNumber: value.seasonNumber === season ? null : season })
              }
            />
          ))}
        </Question>
      ) : null}

      {shows('childcare_need') ? (
        <Question
          label={label('childcare_need', t('onboarding:childcareNeedLabel'))}
          help={help('childcare_need')}
        >
          {(
            wording?.options('childcare_need', childcareNeeds, value.childcareNeed) ??
            childcareNeeds
          ).map(({ value: need, label: needLabel }) => (
            <OptionChip
              key={need}
              label={needLabel}
              accessibilityHint={label('childcare_need', t('onboarding:childcareNeedLabel'))}
              isSelected={value.childcareNeed === need}
              onPress={() =>
                onChange({ childcareNeed: value.childcareNeed === need ? null : need })
              }
            />
          ))}
        </Question>
      ) : null}

      {showSensitive && shows('specific_needs') ? (
        <View className="gap-xs">
          <AuthTextField
            testID={`${testIDPrefix}-specific-needs`}
            label={label('specific_needs', t('onboarding:specificNeedsLabel'))}
            hint={help('specific_needs')}
            value={value.specificNeeds}
            onChangeText={(specificNeeds) => onChange({ specificNeeds })}
            multiline
            maxLength={SPECIFIC_NEEDS_MAX_LENGTH}
          />
          <Text className={`text-start text-form text-neutral-700 ${fontClass}`}>
            {t('onboarding:specificNeedsHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
