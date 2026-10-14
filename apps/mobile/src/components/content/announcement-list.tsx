/**
 * The announcements list of the Content area (RAPP-340): status chips filter
 * it, pages load as she scrolls, and New opens the editor (RAPP-341). The
 * screen above it (`content.tsx`) gives the top of the header and decides
 * where a row opens.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useContentAnnouncements } from '@/lib/content-announcements';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
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
import { ANNOUNCEMENT_CATEGORY_KEYS, ANNOUNCEMENT_STATUS_KEYS } from './announcement-labels';

const EMPTY_ROWS: readonly AnnouncementListRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
// A new filter starts at the top; kept positions hid the first row under the header.
const listPosition = { disabled: true } as const;
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

export function AnnouncementList({
  top,
  selectedId,
  onOpen,
  showTitle,
}: {
  /** The screen's part of the header: back link, area title, content types. */
  readonly top: ReactNode;
  readonly selectedId: string | null;
  readonly onOpen: (id: string) => void;
  /** Hidden when the content-type chips above already name the list. */
  readonly showTitle: boolean;
}) {
  const { t, i18n } = useTranslation('announcements');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const [status, setStatus] = useState<AnnouncementStatusFilter>('all');
  const list = useContentAnnouncements(status);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? EMPTY_ROWS,
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const listRef = useRef<FlashListRef<AnnouncementListRow>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [status]);
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
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AnnouncementListRow>) => (
      <AnnouncementRow
        row={item}
        onOpen={onOpen}
        isSelected={item.id === selectedId}
        date={format.format(new Date(item.published_at ?? item.created_at))}
      />
    ),
    [format, onOpen, selectedId],
  );

  const header = (
    <View className="gap-sm px-lg pb-md pt-lg">
      {top}
      <View className="flex-row flex-wrap items-center justify-between gap-sm">
        {showTitle ? (
          <Text className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}>
            {t('title')}
          </Text>
        ) : null}
        <PressableScale
          testID="content-announcement-new"
          accessibilityRole="button"
          accessibilityLabel={t('newAction')}
          onPress={() => push('/content-announcement-edit/new' as Href)}
          haptic="tapLight"
          className="min-h-recommended justify-center"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('newAction')}</Text>
        </PressableScale>
      </View>
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
      ref={listRef}
      maintainVisibleContentPosition={listPosition}
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
    <View className="flex-1">
      {header}
      {body}
    </View>
  );
}

function RowSeparator() {
  return <View className="h-sm" />;
}
