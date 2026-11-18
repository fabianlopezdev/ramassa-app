import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { KnowledgeCategoryGrid } from '@/components/knowledge/knowledge-category-grid';
import { PageWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { isNetworkStateOnline } from '@/lib/network-status';
import {
  countPlayerGuidesByCategory,
  filterPlayerGuides,
  selectGuideCategories,
  selectPlayerGuides,
  type PlayerGuideFilter,
} from '@/lib/player-guides';
import { usePlayerKnowledgeArticles, usePlayerKnowledgeCategories } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
});
const keyExtractor = (article: KnowledgeArticleListRow) => article.id;
const getItemType = (article: KnowledgeArticleListRow) => article.content_type;

/**
 * Every published guide with its category filter, the Guies segment of the
 * Ajuda tab (RAPP-851). The tab passes its header (title and segments) so it
 * stays on screen while the guides load. Each guide opens `knowledge/[id]`.
 */
export function PlayerGuideList({
  header,
  contentContainerStyle,
}: {
  readonly header: ReactElement;
  readonly contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('knowledge');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { session } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const [filter, setFilter] = useState<PlayerGuideFilter>('all');
  const categoriesQuery = usePlayerKnowledgeCategories();
  const articlesQuery = usePlayerKnowledgeArticles();
  const { refetch: refetchCategories } = categoriesQuery;
  const { refetch: refetchArticles } = articlesQuery;
  const accessToken = session?.access_token;
  const guides = useMemo(() => selectPlayerGuides(articlesQuery.data), [articlesQuery.data]);
  const visibleGuides = useMemo(() => filterPlayerGuides(guides, filter), [guides, filter]);
  const counts = useMemo(() => countPlayerGuidesByCategory(guides), [guides]);
  const guideCategories = useMemo(
    () => selectGuideCategories(categoriesQuery.data, counts),
    [categoriesQuery.data, counts],
  );
  const openGuide = useCallback(
    (id: string) => push({ pathname: '/knowledge/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const refresh = useCallback(() => {
    void Promise.all([refetchCategories(), refetchArticles()]);
  }, [refetchArticles, refetchCategories]);
  const renderGuide = useCallback(
    ({ item, index }: ListRenderItemInfo<KnowledgeArticleListRow>) => (
      <PageWidth className="pb-md">
        <FadeSlideIn index={index}>
          <KnowledgeArticleCard article={item} accessToken={accessToken} onOpen={openGuide} />
        </FadeSlideIn>
      </PageWidth>
    ),
    [accessToken, openGuide],
  );

  const isLoading =
    ((categoriesQuery.isPending && categoriesQuery.data === undefined) ||
      (articlesQuery.isPending && articlesQuery.data === undefined)) &&
    isOnline;
  const loadError = categoriesQuery.error ?? articlesQuery.error;
  const hasNoData = categoriesQuery.data === undefined && articlesQuery.data === undefined;
  let emptyState: ReactElement;
  if (isLoading) {
    emptyState = <AnnouncementFeedSkeleton accessibilityLabel={t('guidesLoading')} />;
  } else if (loadError !== null && hasNoData) {
    emptyState = (
      <AnnouncementFeedError
        message={t('playerLoadFailed')}
        retryLabel={t('playerRetry')}
        code={toAppError(loadError).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
        isLoading={categoriesQuery.isRefetching || articlesQuery.isRefetching}
      />
    );
  } else {
    emptyState = (
      <PageWidth>
        <AnnouncementEmptyState
          title={t('playerEmptyTitle')}
          body={t('playerEmptyBody')}
          languageFontClass={languageFontClass}
        />
      </PageWidth>
    );
  }

  return (
    <FlashList
      testID="knowledge-base-screen"
      data={visibleGuides}
      renderItem={renderGuide}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      extraData={filter}
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={(categoriesQuery.isRefetching || articlesQuery.isRefetching) && isOnline}
      onRefresh={refresh}
      ListHeaderComponent={
        <>
          {header}
          {guides.length === 0 ? null : (
            <PageWidth className="gap-lg pb-lg">
              <KnowledgeCategoryGrid
                categories={guideCategories}
                selected={filter}
                counts={counts}
                onSelect={setFilter}
              />
              <Text
                className={`text-start text-sm font-semibold tabular-nums text-neutral-600 ${languageFontClass}`}
              >
                {t('guidesCount', { count: visibleGuides.length })}
              </Text>
            </PageWidth>
          )}
        </>
      }
      ListEmptyComponent={emptyState}
    />
  );
}
