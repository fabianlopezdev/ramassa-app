import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AttendanceOccurrenceRow } from '@/components/attendance/attendance-occurrence-row';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useAttendanceOccurrences } from '@/lib/attendance';
import { logout } from '@/lib/auth';
import { useUnreadMessages } from '@/lib/messaging';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AttendanceOccurrenceListRow } from '@ramassa/shared/attendance';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_OCCURRENCES: readonly AttendanceOccurrenceListRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
const keyExtractor = (row: AttendanceOccurrenceListRow) => row.id;

export default function AttendanceOccurrencesScreen() {
  const { t, i18n } = useTranslation('attendance');
  const { t: tProfile } = useTranslation('profile');
  const { t: tMessaging } = useTranslation('messaging');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { data, isPending, isError, error, refetch } = useAttendanceOccurrences();
  const unreadMessages = useUnreadMessages().data ?? 0;
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const open = useCallback((id: string) => push(`/attendance/${id}`), [push]);
  const handleRetry = useCallback(() => void refetch(), [refetch]);
  const handleLogout = useCallback(() => void logout(), []);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AttendanceOccurrenceListRow>) => {
      const title = resolveLocalizedText(item.event.title, language)?.text ?? item.event.title.ca;
      return (
        <AttendanceOccurrenceRow
          id={item.id}
          title={title}
          location={item.event.location}
          time={timeFormatter.format(new Date(item.starts_at))}
          accessibilityLabel={t('openSheet', { title })}
          languageFontClass={languageFontClass}
          onOpen={open}
        />
      );
    },
    [language, languageFontClass, open, t, timeFormatter],
  );

  if (isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />;
  if (isError) {
    return (
      <AnnouncementFeedError
        message={t('loadFailed')}
        retryLabel={t('retry')}
        code={toAppError(error).code}
        languageFontClass={languageFontClass}
        onRetry={handleRetry}
      />
    );
  }
  const rows = data ?? EMPTY_OCCURRENCES;
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <PageWidth className="flex-1">
        <View className="gap-xs px-lg pb-md pt-lg">
          <View className="flex-row items-center justify-between gap-md">
            <Text
              accessibilityRole="header"
              className={`flex-1 text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('title')}
            </Text>
            <View className="flex-row items-center gap-sm">
              <PressableScale
                testID="attendance-open-messages"
                accessibilityLabel={tMessaging('unread', { count: unreadMessages })}
                onPress={() => push('/messages' as Href)}
                haptic="selection"
                className="min-h-min justify-center px-sm"
              >
                <Text className={`text-sm font-semibold text-primary-dark ${languageFontClass}`}>
                  {unreadMessages > 0
                    ? tMessaging('managementUnread', { count: unreadMessages })
                    : tMessaging('managementTitle')}
                </Text>
              </PressableScale>
              <PressableScale
                testID="attendance-sign-out"
                accessibilityLabel={tProfile('signOutAction')}
                onPress={handleLogout}
                haptic="tapLight"
                className="min-h-min justify-center px-sm"
              >
                <Text className={`text-sm font-semibold text-primary-dark ${languageFontClass}`}>
                  {tProfile('signOutAction')}
                </Text>
              </PressableScale>
            </View>
          </View>
          <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
            {t('intro')}
          </Text>
          <Text
            className={`pt-md text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('today')}
          </Text>
        </View>
        {rows.length === 0 ? (
          <AnnouncementEmptyState
            title={t('noEventsTitle')}
            body={t('noEventsBody')}
            languageFontClass={languageFontClass}
          />
        ) : (
          <FlashList
            accessibilityRole="list"
            accessibilityLabel={t('today')}
            data={rows}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={listContentStyle}
            contentInsetAdjustmentBehavior="automatic"
            ItemSeparatorComponent={OccurrenceSeparator}
          />
        )}
      </PageWidth>
    </SafeAreaView>
  );
}

function OccurrenceSeparator() {
  return <View className="h-md" />;
}
