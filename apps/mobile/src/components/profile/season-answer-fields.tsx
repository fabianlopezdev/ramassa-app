/**
 * The season registration answers (RAPP-303): applicant status, other
 * entities that support her, which season this is, childcare and specific
 * needs. Every one is optional, so tapping a chosen chip again clears it.
 *
 * Used by the entity's referral form, her own profile edit and the staff
 * record edit. Applicant status and specific needs are sensitive: a screen
 * without participants.view_sensitive passes `showSensitive={false}` and the
 * two never render.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  APPLICANT_STATUSES,
  CHILDCARE_NEEDS,
  SEASON_NUMBERS,
  SPECIFIC_NEEDS_MAX_LENGTH,
  SUPPORTING_ENTITIES_MAX,
  type ApplicantStatus,
  type ChildcareNeed,
  type SeasonNumber,
} from '@ramassa/shared/schemas';

export interface SeasonAnswers {
  readonly applicantStatus: ApplicantStatus | null;
  readonly supportingEntities: readonly string[];
  readonly seasonNumber: SeasonNumber | null;
  readonly childcareNeed: ChildcareNeed | null;
  readonly specificNeeds: string;
}

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
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {label}
      </Text>
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
  readonly testIDPrefix: string;
}

export function SeasonAnswerFields({
  value,
  onChange,
  entityNames,
  showSensitive,
  testIDPrefix,
}: SeasonAnswerFieldsProps) {
  const { t } = useTranslation(['onboarding']);
  const fontClass = useLanguageFontClass();
  const [otherEntity, setOtherEntity] = useState('');

  const offered = [
    ...entityNames,
    ...value.supportingEntities.filter((name) => !entityNames.includes(name)),
  ];
  const toggleEntity = (name: string) =>
    onChange({
      supportingEntities: value.supportingEntities.includes(name)
        ? value.supportingEntities.filter((chosen) => chosen !== name)
        : [...value.supportingEntities, name],
    });
  const addOtherEntity = () => {
    const name = otherEntity.trim();
    if (name === '' || value.supportingEntities.includes(name)) return;
    if (value.supportingEntities.length >= SUPPORTING_ENTITIES_MAX) return;
    onChange({ supportingEntities: [...value.supportingEntities, name] });
    setOtherEntity('');
  };

  return (
    <View className="gap-lg" testID={`${testIDPrefix}-season`}>
      {showSensitive ? (
        <Question label={t('onboarding:applicantStatusLabel')}>
          {APPLICANT_STATUSES.map((status) => (
            <OptionChip
              key={status}
              label={t(APPLICANT_STATUS_KEYS[status])}
              accessibilityHint={t('onboarding:applicantStatusLabel')}
              isSelected={value.applicantStatus === status}
              onPress={() =>
                onChange({ applicantStatus: value.applicantStatus === status ? null : status })
              }
            />
          ))}
        </Question>
      ) : null}

      <View className="gap-sm">
        <Question label={t('onboarding:supportingEntitiesLabel')}>
          {offered.map((name) => (
            <OptionChip
              key={name}
              label={name}
              accessibilityHint={t('onboarding:supportingEntitiesLabel')}
              isSelected={value.supportingEntities.includes(name)}
              onPress={() => toggleEntity(name)}
            />
          ))}
        </Question>
        <View className="flex-row items-end gap-sm">
          <View className="flex-1">
            <AuthTextField
              testID={`${testIDPrefix}-supporting-entity-other`}
              label={t('onboarding:supportingEntitiesOtherLabel')}
              value={otherEntity}
              onChangeText={setOtherEntity}
              onSubmitEditing={addOtherEntity}
              maxLength={200}
            />
          </View>
          <PressableScale
            testID={`${testIDPrefix}-supporting-entity-add`}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding:supportingEntitiesAddAction')}
            onPress={addOtherEntity}
            haptic="tapLight"
            className="min-h-recommended justify-center rounded-md border border-primary px-md"
          >
            <Text className={`text-md font-semibold text-primary-dark ${fontClass}`}>
              {t('onboarding:supportingEntitiesAddAction')}
            </Text>
          </PressableScale>
        </View>
      </View>

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

      <Question label={t('onboarding:childcareNeedLabel')}>
        {CHILDCARE_NEEDS.map((need) => (
          <OptionChip
            key={need}
            label={t(CHILDCARE_KEYS[need])}
            accessibilityHint={t('onboarding:childcareNeedLabel')}
            isSelected={value.childcareNeed === need}
            onPress={() => onChange({ childcareNeed: value.childcareNeed === need ? null : need })}
          />
        ))}
      </Question>

      {showSensitive ? (
        <View className="gap-xs">
          <AuthTextField
            testID={`${testIDPrefix}-specific-needs`}
            label={t('onboarding:specificNeedsLabel')}
            value={value.specificNeeds}
            onChangeText={(specificNeeds) => onChange({ specificNeeds })}
            multiline
            maxLength={SPECIFIC_NEEDS_MAX_LENGTH}
          />
          <Text className={`text-start text-sm text-neutral-500 ${fontClass}`}>
            {t('onboarding:specificNeedsHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
