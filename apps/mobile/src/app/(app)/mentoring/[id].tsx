/**
 * One of her mentoring requests, read only (X5): the topic, her note, the day
 * she preferred, its status, who she meets and when. It reads the request
 * list she already loaded, so it opens offline from the cache too.
 */
import { FailureNotice } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  MENTORING_STATUS_KEYS,
  MENTORING_TOPIC_KEYS,
  preferredSlotParts,
} from '@/lib/mentoring-labels';
import { usePlayerMentoringRequests } from '@/lib/player-mentoring';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  mixedDirectionText: { writingDirection: 'auto' },
});

export default function MentoringRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('mentoring');
  const languageFontClass = useLanguageFontClass();
  const requestsQuery = usePlayerMentoringRequests();
  const request = requestsQuery.data?.find((candidate) => candidate.id === id);
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const formatters = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: MADRID_TIME_ZONE }),
      time: new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: MADRID_TIME_ZONE }),
    }),
    [locale],
  );
  const screenOptions = useMemo(
    () => ({
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal' as const,
      title: t('requestTitle'),
    }),
    [t],
  );
  const preferred = request === undefined ? null : preferredSlotParts(request, locale);
  const note = request?.topicDetail?.trim() ?? '';

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <ScrollView
        testID="mentoring-request-detail"
        style={styles.screen}
        contentContainerClassName="px-lg py-lg"
        contentInsetAdjustmentBehavior="automatic"
      >
        <FormWidth className="gap-lg">
          {request === undefined ? (
            requestsQuery.isPending ? (
              <View
                accessible
                accessibilityLabel={t('requestTitle')}
                accessibilityState={{ busy: true }}
                className="gap-sm"
              >
                <SkeletonPulse className="h-lg w-1/3 rounded-md" />
                <SkeletonPulse className="h-3xl w-full rounded-md" />
              </View>
            ) : requestsQuery.isError ? (
              <FailureNotice
                code={toAppError(requestsQuery.error).code}
                message={t('loadFailed')}
              />
            ) : (
              <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                {t('requestNotFound')}
              </Text>
            )
          ) : (
            <View
              className="gap-sm rounded-lg border border-neutral-200 bg-white p-lg"
              style={continuousCorners}
            >
              <Text
                testID="mentoring-request-detail-status"
                className={`text-start text-md font-bold text-primary ${languageFontClass}`}
              >
                {t(MENTORING_STATUS_KEYS[request.status])}
              </Text>
              <Text
                accessibilityRole="header"
                className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t(MENTORING_TOPIC_KEYS[request.topic])}
              </Text>
              <Text
                selectable
                className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
              >
                {t('requestedOn', { date: formatters.date.format(new Date(request.createdAt)) })}
              </Text>
              {preferred === null ? null : (
                <Text
                  selectable
                  className={`text-start text-md tabular-nums text-neutral-800 ${languageFontClass}`}
                >
                  {preferred.time === null
                    ? t('preferredDay', { date: preferred.date })
                    : t('preferredSlot', { date: preferred.date, time: preferred.time })}
                </Text>
              )}
              {request.scheduledAt === null ? null : (
                <Text
                  selectable
                  testID="mentoring-request-detail-scheduled"
                  className={`text-start text-md font-semibold tabular-nums text-neutral-900 ${languageFontClass}`}
                >
                  {t('scheduledFor', {
                    date: formatters.date.format(new Date(request.scheduledAt)),
                    time: formatters.time.format(new Date(request.scheduledAt)),
                  })}
                </Text>
              )}
              {request.assignedStaffName === null ? null : (
                <Text
                  selectable
                  style={styles.mixedDirectionText}
                  className={`text-start text-md text-neutral-800 ${languageFontClass}`}
                >
                  {t('assignedTo', { name: request.assignedStaffName })}
                </Text>
              )}
              {note.length === 0 ? null : (
                <View className="gap-xs pt-sm">
                  <Text
                    className={`text-start text-sm font-bold text-neutral-800 ${languageFontClass}`}
                  >
                    {t('requestNote')}
                  </Text>
                  <Text
                    selectable
                    style={styles.mixedDirectionText}
                    className={`text-start text-md text-neutral-700 ${languageFontClass}`}
                  >
                    {note}
                  </Text>
                </View>
              )}
            </View>
          )}
        </FormWidth>
      </ScrollView>
    </>
  );
}
