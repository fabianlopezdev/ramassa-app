/**
 * The events list of the Content area (RAPP-342), with the web admin's filters:
 * status chips and category chips. Each row shows the start, the repetition
 * and the places taken. New opens the editor; Manage categories opens the
 * category screen for `events.edit` holders, as the database allows only them
 * to change categories. The screen above it (`content.tsx`) gives the top of
 * the header and decides where a row opens.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useContentEventCategories, useContentEvents } from '@/lib/content-events';
import { continuousCorners } from '@/lib/continuous-corners';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { getAnnouncementLifecycle } from '@ramassa/shared/announcements';
import { toAppError } from '@ramassa/shared/errors';
import {
  EVENT_STATUS_FILTERS,
  formatEventCapacity,
  MADRID_TIME_ZONE,
  parseWeeklyRecurrenceRule,
  type EventListRow,
  type EventStatusFilter,
} from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';
import { EventCategoryGlyph } from './event-category-badge';
import { EVENT_STATUS_KEYS } from './event-labels';

const EMPTY_ROWS: readonly EventListRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
// A new filter starts at the top; kept positions hid the first row under the header.
const listPosition = { disabled: true } as const;
const keyExtractor = (row: EventListRow) => row.id;

const FILTER_LABEL_KEYS = {
  all: 'filterAllStatuses',
  ...EVENT_STATUS_KEYS,
} as const satisfies Record<EventStatusFilter, string>;

/** The repetition as the web admin's table words it. */
export function useRecurrenceLabel() {
  const { t } = useTranslation('events');
  return useCallback(
    (rule: string | null) => {
      const weekly = rule === null ? null : parseWeeklyRecurrenceRule(rule);
      if (weekly?.kind !== 'weekly') return t('recurrenceOneOff');
      return weekly.interval === 1
        ? t('recurrenceEveryWeekSummary', { count: weekly.count })
        : t('recurrenceWeeklySummary', { interval: weekly.interval, count: weekly.count });
    },
    [t],
  );
}

function EventRow({
  row,
  onOpen,
  isSelected,
  start,
  recurrence,
}: {
  readonly row: EventListRow;
  readonly onOpen: (id: string) => void;
  readonly isSelected: boolean;
  readonly start: string;
  readonly recurrence: string;
}) {
  const { t } = useTranslation('events');
  const fontClass = useLanguageFontClass();
  const lifecycle = getAnnouncementLifecycle({
    status: row.status,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  });
  const title = row.title.ca;
  const capacity = formatEventCapacity(
    row.active_signup_count,
    row.max_participants,
    t('unlimited'),
  );
  const detail = [row.category.name.ca, start, recurrence].join(' · ');
  return (
    <PressableScale
      testID={`content-event-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${t(EVENT_STATUS_KEYS[lifecycle])}, ${detail}, ${t('columnCapacity')} ${capacity}`}
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
          testID={`content-event-status-${row.id}`}
          className={`text-sm font-semibold text-neutral-700 ${fontClass}`}
        >
          {t(EVENT_STATUS_KEYS[lifecycle])}
        </Text>
      </View>
      <View className="flex-row items-center gap-xs">
        <EventCategoryGlyph category={row.category} size={14} />
        <Text className={`flex-1 text-start text-sm text-neutral-600 ${fontClass}`}>{detail}</Text>
      </View>
      <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
        {`${t('columnCapacity')}: ${capacity}`}
      </Text>
    </PressableScale>
  );
}

export function EventList({
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
  const { t, i18n } = useTranslation('events');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const canEditCategories = useAccountAccess().permissions.has('events.edit');
  const [status, setStatus] = useState<EventStatusFilter>('all');
  const [category, setCategory] = useState<'all' | string>('all');
  const categories = useContentEventCategories();
  const list = useContentEvents(status, category);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? EMPTY_ROWS,
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const listRef = useRef<FlashListRef<EventListRow>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [status, category]);
  const recurrenceLabel = useRecurrenceLabel();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<EventListRow>) => (
      <EventRow
        row={item}
        onOpen={onOpen}
        isSelected={item.id === selectedId}
        start={format.format(new Date(item.starts_at))}
        recurrence={recurrenceLabel(item.recurrence_rule)}
      />
    ),
    [format, onOpen, recurrenceLabel, selectedId],
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
        <View className="flex-row flex-wrap gap-md">
          {canEditCategories ? (
            <PressableScale
              testID="content-event-categories"
              accessibilityRole="button"
              accessibilityLabel={t('manageCategories')}
              onPress={() => push('/content-event-categories' as Href)}
              haptic="tapLight"
              className="min-h-recommended justify-center"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {t('manageCategories')}
              </Text>
            </PressableScale>
          ) : null}
          <PressableScale
            testID="content-event-new"
            accessibilityRole="button"
            accessibilityLabel={t('newAction')}
            onPress={() => push('/content-event-edit/new' as Href)}
            haptic="tapLight"
            className="min-h-recommended justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('newAction')}</Text>
          </PressableScale>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {EVENT_STATUS_FILTERS.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`content-event-status-filter-${candidate}`}
              value={candidate}
              label={t(FILTER_LABEL_KEYS[candidate])}
              selected={candidate === status}
              onSelect={setStatus}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>
      {(categories.data?.length ?? 0) > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-sm">
            <ChoiceOption
              testID="content-event-category-filter-all"
              value="all"
              label={t('filterAllCategories')}
              selected={category === 'all'}
              onSelect={setCategory}
              languageFontClass={fontClass}
            />
            {categories.data?.map((candidate) => (
              <ChoiceOption
                key={candidate.id}
                testID={`content-event-category-filter-${candidate.id}`}
                value={candidate.id}
                label={candidate.name.ca}
                selected={candidate.id === category}
                onSelect={setCategory}
                languageFontClass={fontClass}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
      {list.isSuccess ? (
        <Text
          testID="content-events-total"
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
      message={t('playerLoadFailed')}
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
