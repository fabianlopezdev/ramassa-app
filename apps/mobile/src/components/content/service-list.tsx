/**
 * The services list of the Content area (RAPP-344), with the web admin's
 * filters: status chips and category chips. Each row shows the category, the
 * availability and how many players are interested. Manage categories opens
 * the category screens for `services.edit` holders (RAPP-347). The screen above it
 * (`content.tsx`) gives the top of the header and decides where a row opens.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useContentServiceCategories, useContentServices } from '@/lib/content-services';
import { continuousCorners } from '@/lib/continuous-corners';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  getServiceLifecycle,
  SERVICE_STATUS_FILTERS,
  type AdminServiceCategory,
  type AdminServiceRow,
  type ServiceSearch,
} from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';
import { SERVICE_AVAILABILITY_KEYS, SERVICE_STATUS_KEYS } from './service-labels';

const EMPTY_ROWS: readonly AdminServiceRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
// A new filter starts at the top; kept positions hid the first row under the header.
const listPosition = { disabled: true } as const;
const keyExtractor = (row: AdminServiceRow) => row.id;

const FILTER_KEYS = {
  all: 'filterAll',
  ...SERVICE_STATUS_KEYS,
} as const satisfies Record<ServiceSearch['status'], string>;

function ServiceRow({
  row,
  categoryName,
  onOpen,
  isSelected,
}: {
  readonly row: AdminServiceRow;
  readonly categoryName: string;
  readonly onOpen: (id: string) => void;
  readonly isSelected: boolean;
}) {
  const { t } = useTranslation('services');
  const fontClass = useLanguageFontClass();
  const status = t(
    SERVICE_STATUS_KEYS[
      getServiceLifecycle({
        status: row.status,
        publishedAt: row.published_at,
        expiresAt: row.expires_at,
      })
    ],
  );
  const detail = [
    categoryName,
    t(SERVICE_AVAILABILITY_KEYS[row.availability]),
    `${t('columnInterests')}: ${row.interest_count}`,
  ].join(' · ');
  return (
    <PressableScale
      testID={`content-service-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${row.title.ca}, ${status}, ${detail}`}
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
          {row.title.ca}
        </Text>
        <Text
          testID={`content-service-status-${row.id}`}
          className={`text-sm font-semibold text-neutral-700 ${fontClass}`}
        >
          {status}
        </Text>
      </View>
      <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
        {detail}
      </Text>
    </PressableScale>
  );
}

function categoryName(
  categories: readonly AdminServiceCategory[] | undefined,
  categoryId: string,
  language: SupportedLanguage,
): string {
  const category = categories?.find((candidate) => candidate.id === categoryId);
  return category === undefined ? '' : (category.name[language] ?? category.name.ca);
}

export function ServiceList({
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
  const { t, i18n } = useTranslation('services');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const { push } = useRouter();
  const canEditCategories = useAccountAccess().permissions.has('services.edit');
  const [status, setStatus] = useState<ServiceSearch['status']>('all');
  const [category, setCategory] = useState<ServiceSearch['category']>('all');
  const categories = useContentServiceCategories();
  const list = useContentServices(status, category);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? EMPTY_ROWS,
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const listRef = useRef<FlashListRef<AdminServiceRow>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [status, category]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AdminServiceRow>) => (
      <ServiceRow
        row={item}
        categoryName={categoryName(categories.data, item.category_id, language)}
        onOpen={onOpen}
        isSelected={item.id === selectedId}
      />
    ),
    [categories.data, language, onOpen, selectedId],
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
              testID="content-service-categories"
              accessibilityRole="button"
              accessibilityLabel={t('categoriesAction')}
              onPress={() => push('/content-service-categories' as Href)}
              haptic="tapLight"
              className="min-h-recommended justify-center"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {t('categoriesAction')}
              </Text>
            </PressableScale>
          ) : null}
          <PressableScale
            testID="content-service-new"
            accessibilityRole="button"
            accessibilityLabel={t('newAction')}
            onPress={() => push('/content-service-edit/new' as Href)}
            haptic="tapLight"
            className="min-h-recommended justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('newAction')}</Text>
          </PressableScale>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {SERVICE_STATUS_FILTERS.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`content-service-status-filter-${candidate}`}
              value={candidate}
              label={t(FILTER_KEYS[candidate])}
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
              testID="content-service-category-filter-all"
              value="all"
              label={t('filterAll')}
              selected={category === 'all'}
              onSelect={setCategory}
              languageFontClass={fontClass}
            />
            {categories.data?.map((candidate) => (
              <ChoiceOption
                key={candidate.id}
                testID={`content-service-category-filter-${candidate.slug}`}
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
          testID="content-services-total"
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
