/**
 * The review queue of the Content area (RAPP-345), with the web admin's
 * filters: the kind (a pending submission, or a change an entity made to a
 * live service), the category, and a search by service, entity or contact.
 * Pending submissions come first, oldest first. The screen above it
 * (`content.tsx`) gives the top of the header and decides where a row opens.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useServiceReviewQueue } from '@/lib/content-service-reviews';
import { useContentServiceCategories } from '@/lib/content-services';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  SERVICE_REVIEW_KINDS,
  type ServiceReviewQueueItem,
  type ServiceReviewSearch,
} from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_ROWS: readonly ServiceReviewQueueItem[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
// A new filter starts at the top; kept positions hid the first row under the header.
const listPosition = { disabled: true } as const;
const keyExtractor = (row: ServiceReviewQueueItem) => `${row.kind}-${row.id}`;

const KIND_KEYS = {
  all: 'filterAll',
  pending: 'reviewKindPending',
  published_edit: 'reviewKindPublishedEdit',
} as const satisfies Record<ServiceReviewSearch['kind'], string>;

/**
 * One queue item as a single key: the service, and for a change to a live
 * service also the notification that holds its before-and-after snapshot.
 */
function reviewKey(item: Pick<ServiceReviewQueueItem, 'kind' | 'id' | 'serviceId'>) {
  return item.kind === 'pending' ? item.serviceId : `${item.serviceId}:${item.id}`;
}

export function parseReviewKey(key: string): {
  readonly serviceId: string;
  readonly notificationId: string | null;
} {
  const [serviceId = '', notificationId] = key.split(':');
  return { serviceId, notificationId: notificationId ?? null };
}

function ReviewRow({
  row,
  categoryName,
  date,
  onOpen,
  isSelected,
}: {
  readonly row: ServiceReviewQueueItem;
  readonly categoryName: string;
  readonly date: string;
  readonly onOpen: (key: string) => void;
  readonly isSelected: boolean;
}) {
  const { t } = useTranslation('services');
  const fontClass = useLanguageFontClass();
  const kind = t(KIND_KEYS[row.kind]);
  const detail = [categoryName, row.providerName, row.contactName].filter(Boolean).join(' · ');
  return (
    <PressableScale
      testID={`content-review-${row.kind}-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${row.title.ca}, ${kind}, ${detail}, ${date}`}
      onPress={() => onOpen(reviewKey(row))}
      haptic="selection"
      isSelected={isSelected}
      style={continuousCorners}
      className={`min-h-recommended justify-center gap-xs rounded-md border bg-white px-md py-sm ${
        isSelected ? 'border-primary' : 'border-neutral-200'
      }`}
    >
      <View className="flex-row flex-wrap items-baseline justify-between gap-sm">
        <Text className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}>
          {row.title.ca}
        </Text>
        <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>{kind}</Text>
      </View>
      {detail.length === 0 ? null : (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{detail}</Text>
      )}
      <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
        {date}
      </Text>
    </PressableScale>
  );
}

export function ServiceReviewList({
  top,
  selectedKey,
  onOpen,
  showTitle,
}: {
  /** The screen's part of the header: back link, area title, content types. */
  readonly top: ReactNode;
  readonly selectedKey: string | null;
  readonly onOpen: (key: string) => void;
  /** Hidden when the content-type chips above already name the list. */
  readonly showTitle: boolean;
}) {
  const { t, i18n } = useTranslation('services');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const [kind, setKind] = useState<ServiceReviewSearch['kind']>('all');
  const [category, setCategory] = useState<ServiceReviewSearch['category']>('all');
  const [query, setQuery] = useState('');
  // Typing does not fetch on every letter.
  const deferredQuery = useDeferredValue(query.trim());
  const categories = useContentServiceCategories();
  const list = useServiceReviewQueue(kind, category, deferredQuery);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? EMPTY_ROWS,
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const listRef = useRef<FlashListRef<ServiceReviewQueueItem>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [kind, category, deferredQuery]);
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    [language],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ServiceReviewQueueItem>) => {
      const found = categories.data?.find((candidate) => candidate.id === item.categoryId);
      return (
        <ReviewRow
          row={item}
          categoryName={found === undefined ? '' : (found.name[language] ?? found.name.ca)}
          date={t('reviewChangedAt', { date: format.format(new Date(item.changedAt)) })}
          onOpen={onOpen}
          isSelected={reviewKey(item) === selectedKey}
        />
      );
    },
    [categories.data, format, language, onOpen, selectedKey, t],
  );

  const header = (
    <View className="gap-sm px-lg pb-md pt-lg">
      {top}
      {showTitle ? (
        <Text className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}>
          {t('reviewQueueTitle')}
        </Text>
      ) : null}
      <AuthTextField
        testID="content-review-query"
        label={t('reviewFilterQuery')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {SERVICE_REVIEW_KINDS.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`content-review-kind-${candidate}`}
              value={candidate}
              label={t(KIND_KEYS[candidate])}
              selected={candidate === kind}
              onSelect={setKind}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>
      {(categories.data?.length ?? 0) > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-sm">
            <ChoiceOption
              testID="content-review-category-all"
              value="all"
              label={t('filterAll')}
              selected={category === 'all'}
              onSelect={setCategory}
              languageFontClass={fontClass}
            />
            {categories.data?.map((candidate) => (
              <ChoiceOption
                key={candidate.id}
                testID={`content-review-category-${candidate.slug}`}
                value={candidate.id}
                label={candidate.name[language] ?? candidate.name.ca}
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
          testID="content-reviews-total"
          className={`text-start text-sm text-neutral-600 ${fontClass}`}
        >
          {t('reviewQueueSummary', { count: total })}
        </Text>
      ) : null}
    </View>
  );

  const body = list.isPending ? (
    <AnnouncementFeedSkeleton accessibilityLabel={t('reviewQueueTitle')} />
  ) : list.isError ? (
    <AnnouncementFeedError
      message={t('reviewLoadFailed')}
      retryLabel={tErrors('retry')}
      code={toAppError(list.error).code}
      languageFontClass={fontClass}
      onRetry={() => void list.refetch()}
      isLoading={list.isFetching}
    />
  ) : rows.length === 0 ? (
    <AnnouncementEmptyState
      title={t('reviewQueueEmptyTitle')}
      body={t('reviewQueueEmptyBody')}
      languageFontClass={fontClass}
    />
  ) : (
    <FlashList
      ref={listRef}
      maintainVisibleContentPosition={listPosition}
      accessibilityRole="list"
      accessibilityLabel={t('reviewQueueTitle')}
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={selectedKey}
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
