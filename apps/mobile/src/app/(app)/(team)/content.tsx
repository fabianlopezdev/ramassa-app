/**
 * The Content area (RAPP-340): the content types the person manages, starting
 * with announcements, as the web admin's Content menu has them. Status chips
 * filter the list; pages load as she scrolls. On a phone a row opens its own
 * screen; on a tablet it opens beside the list. Events, knowledge and
 * services join in later slices of phase 4.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AnnouncementDetail } from '@/components/content/announcement-detail';
import {
  ANNOUNCEMENT_CATEGORY_KEYS,
  ANNOUNCEMENT_STATUS_KEYS,
} from '@/components/content/announcement-labels';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { TeamBackToHome } from '@/components/team/team-back-to-home';
import { useTeamLayout } from '@/components/team/team-layout-context';
import { useContentAnnouncements } from '@/lib/content-announcements';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ANNOUNCEMENT_STATUS_FILTERS,
  getAnnouncementLifecycle,
  type AnnouncementListRow,
  type AnnouncementStatusFilter,
} from '@ramassa/shared/announcements';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_ROWS: readonly AnnouncementListRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
const listPaneStyle = { flex: 1 } as const;
const DETAIL_MIN = 320;
const DETAIL_MAX = 480;
const keyExtractor = (row: AnnouncementListRow) => row.id;

const FILTER_LABEL_KEYS = {
  all: 'filterAll',
  ...ANNOUNCEMENT_STATUS_KEYS,
} as const satisfies Record<AnnouncementStatusFilter, string>;

function AnnouncementRow({
  row,
  onOpen,
  isSelected,
  date,
}: {
  readonly row: AnnouncementListRow;
  readonly onOpen: (id: string) => void;
  readonly isSelected: boolean;
  readonly date: string;
}) {
  const { t } = useTranslation('announcements');
  const fontClass = useLanguageFontClass();
  const lifecycle = getAnnouncementLifecycle({
    status: row.status,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  });
  const title = row.title.ca ?? '';
  const detail = [t(ANNOUNCEMENT_CATEGORY_KEYS[row.category]), date].filter(Boolean).join(' · ');
  return (
    <PressableScale
      testID={`content-announcement-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${t(ANNOUNCEMENT_STATUS_KEYS[lifecycle])}, ${detail}`}
      onPress={() => onOpen(row.id)}
      haptic="selection"
      isSelected={isSelected}
      style={continuousCorners}
      className={`min-h-recommended justify-center gap-xs rounded-md border bg-white px-md py-sm ${
        isSelected ? 'border-primary' : 'border-neutral-200'
      }`}
    >
      <View className="flex-row flex-wrap items-baseline justify-between gap-sm">
        <Text className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}>
          {title}
        </Text>
        <Text
          testID={`content-announcement-status-${row.id}`}
          className={`text-sm font-semibold text-neutral-700 ${fontClass}`}
        >
          {[t(ANNOUNCEMENT_STATUS_KEYS[lifecycle]), row.is_pinned ? t('pinned') : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{detail}</Text>
    </PressableScale>
  );
}

export default function ContentScreen() {
  const { t, i18n } = useTranslation('announcements');
  const { t: tNav } = useTranslation('nav');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const isSplit = useTeamLayout() === 'sidebar';
  const { width } = useWindowDimensions();
  const [status, setStatus] = useState<AnnouncementStatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useContentAnnouncements(status);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? EMPTY_ROWS,
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const detailStyle = useMemo(
    () => ({ width: Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Math.round(width * 0.4))) }),
    [width],
  );
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );

  const open = useCallback(
    (id: string) => (isSplit ? setSelectedId(id) : push(`/content-announcement/${id}` as Href)),
    [isSplit, push],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AnnouncementListRow>) => (
      <AnnouncementRow
        row={item}
        onOpen={open}
        isSelected={item.id === selectedId}
        date={format.format(new Date(item.published_at ?? item.created_at))}
      />
    ),
    [format, open, selectedId],
  );

  const header = (
    <View className="gap-sm px-lg pb-md pt-lg">
      <TeamBackToHome />
      <Text
        accessibilityRole="header"
        className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
      >
        {tNav('team.content')}
      </Text>
      <Text className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}>
        {t('title')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {ANNOUNCEMENT_STATUS_FILTERS.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`content-status-${candidate}`}
              value={candidate}
              label={t(FILTER_LABEL_KEYS[candidate])}
              selected={candidate === status}
              onSelect={setStatus}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>
      {list.isSuccess ? (
        <Text
          testID="content-announcements-total"
          className={`text-start text-sm text-neutral-600 ${fontClass}`}
        >
          {t('summary', { count: total })}
        </Text>
      ) : null}
    </View>
  );

  const body = list.isPending ? (
    <AnnouncementFeedSkeleton accessibilityLabel={t('title')} />
  ) : list.isError ? (
    <AnnouncementFeedError
      message={t('loadFailed')}
      retryLabel={tErrors('retry')}
      code={toAppError(list.error).code}
      languageFontClass={fontClass}
      onRetry={() => void list.refetch()}
      isLoading={list.isFetching}
    />
  ) : rows.length === 0 ? (
    <AnnouncementEmptyState
      title={t('emptyTitle')}
      body={t('emptyBody')}
      languageFontClass={fontClass}
    />
  ) : (
    <FlashList
      accessibilityRole="list"
      accessibilityLabel={t('title')}
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={selectedId}
      contentContainerStyle={listContentStyle}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      }}
      ItemSeparatorComponent={RowSeparator}
      ListFooterComponent={
        list.isFetchingNextPage ? <ActivityIndicator color={tokens.colors.primary.DEFAULT} /> : null
      }
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      {isSplit ? (
        <View className="flex-1 flex-row">
          <View style={listPaneStyle}>
            {header}
            {body}
          </View>
          <View style={detailStyle} className="border-s border-neutral-200 bg-white">
            {selectedId === null ? null : (
              <AnnouncementDetail
                key={selectedId}
                announcementId={selectedId}
                onDeleted={() => setSelectedId(null)}
              />
            )}
          </View>
        </View>
      ) : (
        <PageWidth className="flex-1">
          {header}
          {body}
        </PageWidth>
      )}
    </SafeAreaView>
  );
}

function RowSeparator() {
  return <View className="h-sm" />;
}
