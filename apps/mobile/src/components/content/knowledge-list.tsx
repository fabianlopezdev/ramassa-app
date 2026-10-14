/**
 * The knowledge list of the Content area (RAPP-343), with the web admin's
 * filters: all content, staff resources or participant stories, and for
 * stories their review state. Each row shows the category, the type and, for a
 * story, its author's first name. The screen above it (`content.tsx`) gives the
 * top of the header and decides where a row opens.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useContentKnowledge } from '@/lib/content-knowledge';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import {
  KNOWLEDGE_KIND_FILTERS,
  STORY_STATUSES,
  type KnowledgeArticleListRow,
  type KnowledgeKindFilter,
  type KnowledgeStoryStatusFilter,
} from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';
import {
  KNOWLEDGE_TYPE_KEYS,
  knowledgeStatusKey,
  knowledgeTitle,
  STORY_STATUS_KEYS,
} from './knowledge-labels';

const EMPTY_ROWS: readonly KnowledgeArticleListRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
// A new filter starts at the top; kept positions hid the first row under the header.
const listPosition = { disabled: true } as const;
const keyExtractor = (row: KnowledgeArticleListRow) => row.id;

const KIND_KEYS = {
  all: 'filterAll',
  articles: 'filterArticles',
  stories: 'filterStories',
} as const satisfies Record<KnowledgeKindFilter, string>;

function KnowledgeRow({
  row,
  onOpen,
  isSelected,
}: {
  readonly row: KnowledgeArticleListRow;
  readonly onOpen: (id: string) => void;
  readonly isSelected: boolean;
}) {
  const { t } = useTranslation('knowledge');
  const fontClass = useLanguageFontClass();
  const title = knowledgeTitle(row) || t('contentUnavailable');
  const status = t(knowledgeStatusKey(row));
  const detail = [
    row.category.name.ca,
    t(KNOWLEDGE_TYPE_KEYS[row.content_type]),
    row.author_first_name === null
      ? null
      : t('participantAttribution', { name: row.author_first_name }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale
      testID={`content-knowledge-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status}, ${detail}`}
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
          testID={`content-knowledge-status-${row.id}`}
          className={`text-sm font-semibold text-neutral-700 ${fontClass}`}
        >
          {status}
        </Text>
      </View>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{detail}</Text>
    </PressableScale>
  );
}

export function KnowledgeList({
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
  const { t } = useTranslation('knowledge');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const [kind, setKind] = useState<KnowledgeKindFilter>('all');
  const [storyStatus, setStoryStatus] = useState<KnowledgeStoryStatusFilter>('all');
  const list = useContentKnowledge(kind, kind === 'stories' ? storyStatus : 'all');
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? EMPTY_ROWS,
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const listRef = useRef<FlashListRef<KnowledgeArticleListRow>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [kind, storyStatus]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<KnowledgeArticleListRow>) => (
      <KnowledgeRow row={item} onOpen={onOpen} isSelected={item.id === selectedId} />
    ),
    [onOpen, selectedId],
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
          testID="content-knowledge-new"
          accessibilityRole="button"
          accessibilityLabel={t('newAction')}
          onPress={() => push('/content-knowledge-edit/new' as Href)}
          haptic="tapLight"
          className="min-h-recommended justify-center"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('newAction')}</Text>
        </PressableScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {KNOWLEDGE_KIND_FILTERS.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`content-knowledge-kind-${candidate}`}
              value={candidate}
              label={t(KIND_KEYS[candidate])}
              selected={candidate === kind}
              onSelect={setKind}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>
      {kind === 'stories' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-sm">
            <ChoiceOption
              testID="content-knowledge-story-all"
              value="all"
              label={t('filterAll')}
              selected={storyStatus === 'all'}
              onSelect={setStoryStatus}
              languageFontClass={fontClass}
            />
            {STORY_STATUSES.map((candidate) => (
              <ChoiceOption
                key={candidate}
                testID={`content-knowledge-story-${candidate}`}
                value={candidate}
                label={t(STORY_STATUS_KEYS[candidate])}
                selected={candidate === storyStatus}
                onSelect={setStoryStatus}
                languageFontClass={fontClass}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
      {list.isSuccess ? (
        <Text
          testID="content-knowledge-total"
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
