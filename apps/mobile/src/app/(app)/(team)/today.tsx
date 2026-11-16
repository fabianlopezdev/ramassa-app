import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AttendanceOccurrenceRow } from '@/components/attendance/attendance-occurrence-row';
import { AttendanceSheet } from '@/components/attendance/attendance-sheet';
import { PageWidth } from '@/components/layout/content-width';
import { TeamBackToHome } from '@/components/team/team-back-to-home';
import { useTeamLayout } from '@/components/team/team-layout-context';
import { TodayPendingList } from '@/components/team/today-pending-list';
import { useAttendanceOccurrences } from '@/lib/attendance';
import { teamAreas } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

// Two parts list, three parts open item, within sensible bounds.
const listPaneStyle = { flex: 2, minWidth: 280, maxWidth: 400 } as const;
const detailPaneStyle = { flex: 3 } as const;

export default function AttendanceOccurrencesScreen() {
  const { t, i18n } = useTranslation('attendance');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { data, isPending, isError, error, refetch } = useAttendanceOccurrences();
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const { t: tNav } = useTranslation('nav');
  const layout = useTeamLayout();
  const isSplit = layout === 'sidebar';
  // Avui in every layout (RAPP-795): today's sessions first for whoever takes
  // attendance, then the "Pendent" list. Without an attendance permission the
  // sessions block is left out.
  const { permissions } = useAccountAccess();
  const hasSessions = teamAreas(permissions).includes('attendance');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const open = useCallback(
    (id: string) => (isSplit ? setSelectedId(id) : push(`/attendance/${id}`)),
    [isSplit, push],
  );
  const handleRetry = useCallback(() => void refetch(), [refetch]);
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

  if (hasSessions && isPending) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />;
  }
  if (hasSessions && isError) {
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
  const rows = hasSessions ? (data ?? EMPTY_OCCURRENCES) : EMPTY_OCCURRENCES;
  // Everything scrolls as one list: the sessions are its rows and the
  // "Pendent" list its footer. Cards fixed above the list once filled a phone
  // screen and hid the sessions under the tab bar (RAPP-481).
  const header = (
    <View className="gap-xs pb-md pt-lg">
      <TeamBackToHome />
      <Text
        accessibilityRole="header"
        className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {tNav('team.today')}
      </Text>
      <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
        {tNav('team.todayIntro')}
      </Text>
      {hasSessions ? (
        <Text
          accessibilityRole="header"
          className={`pt-md text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {t('today')}
        </Text>
      ) : null}
    </View>
  );
  const footer = (
    <View className="pt-lg">
      <TodayPendingList />
    </View>
  );
  const list = (
    <PageWidth className="flex-1">
      <FlashList
        accessibilityRole="list"
        accessibilityLabel={t('today')}
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={listContentStyle}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={OccurrenceSeparator}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          hasSessions ? (
            <AnnouncementEmptyState
              title={t('noEventsTitle')}
              body={t('noEventsBody')}
              languageFontClass={languageFontClass}
            />
          ) : null
        }
      />
    </PageWidth>
  );
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      {isSplit && hasSessions ? (
        // A tablet keeps the list beside the open item (RAPP-245).
        <View className="flex-1 flex-row">
          <View style={listPaneStyle}>{list}</View>
          <View style={detailPaneStyle} className="border-s border-neutral-200 bg-white">
            {selectedId === null ? (
              <View className="flex-1 items-center justify-center p-lg">
                <Text className={`text-center text-md text-neutral-600 ${languageFontClass}`}>
                  {t('selectSession')}
                </Text>
              </View>
            ) : (
              <AttendanceSheet key={selectedId} occurrenceId={selectedId} />
            )}
          </View>
        </View>
      ) : (
        list
      )}
    </SafeAreaView>
  );
}

function OccurrenceSeparator() {
  return <View className="h-md" />;
}
