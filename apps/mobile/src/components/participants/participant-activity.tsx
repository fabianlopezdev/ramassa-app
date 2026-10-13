/**
 * Her activity timeline on the participant card (RAPP-283), with the web
 * admin's filters: everything, or one source at a time. The first entries
 * show at once and the rest on request, so a long history does not push her
 * material far down the card.
 */
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useParticipantActivity } from '@/lib/participant-lookup';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import {
  activityDetailKey,
  filterParticipantActivity,
  PARTICIPANT_ACTIVITY_KINDS,
  type ParticipantActivityFilter,
} from '@ramassa/shared/participants';
import { tokens } from '@ramassa/shared/tokens';

const FIRST_ENTRIES = 10;

const ACTIVITY_LABEL_KEYS = {
  all: 'activityAll',
  attendance: 'activityAttendance',
  event_signup: 'activityEventSignup',
  message: 'activityMessage',
  forum_post: 'activityForumPost',
  feedback: 'activityFeedback',
  equipment: 'activityEquipment',
  service_interest: 'activityServiceInterest',
  referral_update: 'activityReferralUpdate',
} as const satisfies Record<ParticipantActivityFilter, string>;

const ACTIVITY_FILTERS: readonly ParticipantActivityFilter[] = [
  'all',
  ...PARTICIPANT_ACTIVITY_KINDS,
];

export function ParticipantActivity({ participantId }: { readonly participantId: string }) {
  const { t, i18n } = useTranslation(['participants', 'attendance', 'errors']);
  const fontClass = useLanguageFontClass();
  const activity = useParticipantActivity(participantId);
  const [filter, setFilter] = useState<ParticipantActivityFilter>('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [locale],
  );
  const entries = useMemo(
    () => filterParticipantActivity(activity.data ?? [], filter),
    [activity.data, filter],
  );
  const shown = isExpanded ? entries : entries.slice(0, FIRST_ENTRIES);

  return (
    <View className="gap-sm" testID="participant-activity">
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {t('sectionActivity')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {ACTIVITY_FILTERS.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`activity-filter-${candidate}`}
              value={candidate}
              label={t(ACTIVITY_LABEL_KEYS[candidate])}
              selected={candidate === filter}
              onSelect={(value) => {
                setFilter(value);
                setIsExpanded(false);
              }}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>

      {activity.isPending ? (
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      ) : activity.isError ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('errors:retry')}
          onPress={() => void activity.refetch()}
          haptic="tapLight"
          className="min-h-recommended justify-center self-start"
        >
          <Text className={`text-start text-sm text-error ${fontClass}`}>
            {`${t('activity.loadFailed')} ${t('errors:retry')}`}
          </Text>
        </PressableScale>
      ) : entries.length === 0 ? (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('activityEmpty')}
        </Text>
      ) : (
        <View className="gap-sm">
          {shown.map((entry) => {
            const key = activityDetailKey(entry);
            const detail = key === null ? entry.detail : t(key);
            const meta = `${t(ACTIVITY_LABEL_KEYS[entry.kind])} · ${format.format(
              new Date(entry.occurred_at),
            )}`;
            return (
              <View
                key={`${entry.kind}-${entry.id}`}
                testID={`participant-activity-${entry.kind}`}
                accessible
                accessibilityLabel={[entry.title, detail, meta].filter(Boolean).join('. ')}
                className="gap-xs border-s-2 border-neutral-300 ps-md"
              >
                <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
                  {entry.title}
                </Text>
                {detail === null ? null : (
                  <Text className={`text-start text-sm text-neutral-800 ${fontClass}`}>
                    {detail}
                  </Text>
                )}
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{meta}</Text>
              </View>
            );
          })}
          {entries.length > shown.length ? (
            <PressableScale
              testID="activity-show-all"
              accessibilityRole="button"
              accessibilityLabel={t('activity.showAll', { count: entries.length })}
              onPress={() => setIsExpanded(true)}
              haptic="tapLight"
              className="min-h-recommended justify-center self-start"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {t('activity.showAll', { count: entries.length })}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      )}
    </View>
  );
}
