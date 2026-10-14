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
import { TodayCheckoutsCard } from '@/components/team/today-checkouts-card';
import { TodayForumCard } from '@/components/team/today-forum-card';
import { TodayMaterialCard } from '@/components/team/today-material-card';
import { TodayMessagesCard } from '@/components/team/today-messages-card';
import { TodayReviewsCard } from '@/components/team/today-reviews-card';
import { useAttendanceOccurrences } from '@/lib/attendance';
import { teamAreas } from '@/lib/team-shell';
import { todaySections } from '@/lib/today';
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
  // In the large-button layout this is the Attendance button's screen; in tabs
  // and the sidebar it is Today, with a section per area (RAPP-246).
  const isToday = layout !== 'home';
  const { permissions } = useAccountAccess();
  const sections = todaySections(teamAreas(permissions), permissions);
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
  const list = (
    <>
      <PageWidth className="flex-1">
        <View className="gap-xs px-lg pb-md pt-lg">
          <TeamBackToHome />
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {isToday ? tNav('team.today') : t('title')}
          </Text>
          <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
            {isToday ? tNav('team.todayIntro') : t('intro')}
          </Text>
          {/* The card adds its own spacing, and nothing when nothing is late. */}
          {isToday ? <TodayCheckoutsCard /> : null}
          {isToday && sections.includes('material') ? (
            <View className="pt-md">
              <TodayMaterialCard />
            </View>
          ) : null}
          {isToday && sections.includes('reviews') ? (
            <View className="pt-md">
              <TodayReviewsCard />
            </View>
          ) : null}
          {isToday && sections.includes('forum') ? (
            <View className="pt-md">
              <TodayForumCard />
            </View>
          ) : null}
          {isToday && sections.includes('messages') ? (
            <View className="pt-md">
              <TodayMessagesCard />
            </View>
          ) : null}
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
    </>
  );
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      {isSplit ? (
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
