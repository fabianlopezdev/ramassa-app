import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { KnowledgeCategoryGrid } from '@/components/knowledge/knowledge-category-grid';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
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
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: tokens.colors.white },
  content: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing['3xl'] },
});

const keyExtractor = (article: KnowledgeArticleListRow) => article.id;
const getItemType = (article: KnowledgeArticleListRow) => article.content_type;

export default function PlayerKnowledgeScreen() {
  const { t } = useTranslation(['knowledge', 'common']);
  const { push } = useRouter();
  const { session } = useAuth();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const [filter, setFilter] = useState<PlayerGuideFilter>('all');
  const categoriesQuery = usePlayerKnowledgeCategories();
  const articlesQuery = usePlayerKnowledgeArticles();
  const { refetch: refetchCategories } = categoriesQuery;
  const { refetch: refetchArticles } = articlesQuery;
  const guides = useMemo(() => selectPlayerGuides(articlesQuery.data), [articlesQuery.data]);
  const visibleGuides = useMemo(() => filterPlayerGuides(guides, filter), [guides, filter]);
  const counts = useMemo(() => countPlayerGuidesByCategory(guides), [guides]);
  const guideCategories = useMemo(
    () => selectGuideCategories(categoriesQuery.data, counts),
    [categoriesQuery.data, counts],
  );

  const openArticle = useCallback((id: string) => push(`/knowledge/${id}` as Href), [push]);
  const refresh = useCallback(() => {
    void Promise.all([refetchCategories(), refetchArticles()]);
  }, [refetchArticles, refetchCategories]);
  const renderArticle = useCallback(
    ({ item }: ListRenderItemInfo<KnowledgeArticleListRow>) => (
      <PageWidth className="pb-md">
        <KnowledgeArticleCard
          article={item}
          accessToken={session?.access_token}
          onOpen={openArticle}
        />
      </PageWidth>
    ),
    [openArticle, session?.access_token],
  );
  const insets = useSafeAreaInsets();
  const contentContainerStyle = useMemo(
    () => [
      styles.content,
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing['3xl'],
          }
        : { paddingTop: tokens.spacing.lg },
    ],
    [insets.bottom],
  );

  if (
    (categoriesQuery.isPending && categoriesQuery.data === undefined) ||
    (articlesQuery.isPending && articlesQuery.data === undefined)
  ) {
    return (
      <>
        <NativeScreenHeader title={t('knowledge:guidesTitle')} />
        <AnnouncementFeedSkeleton accessibilityLabel={t('knowledge:guidesLoading')} />
      </>
    );
  }
  const loadError = categoriesQuery.error ?? articlesQuery.error;
  if (
    loadError !== null &&
    categoriesQuery.data === undefined &&
    articlesQuery.data === undefined
  ) {
    return (
      <>
        <NativeScreenHeader title={t('knowledge:guidesTitle')} />
        <AnnouncementFeedError
          message={t('knowledge:playerLoadFailed')}
          retryLabel={t('knowledge:playerRetry')}
          code={toAppError(loadError).code}
          languageFontClass={languageFontClass}
          onRetry={refresh}
        />
      </>
    );
  }

  return (
    <>
      <NativeScreenHeader title={t('knowledge:guidesTitle')} />
      <FlashList
        testID="knowledge-base-screen"
        data={visibleGuides}
        renderItem={renderArticle}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={filter}
        style={styles.list}
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={(categoriesQuery.isRefetching || articlesQuery.isRefetching) && !isOffline}
        onRefresh={refresh}
        ListHeaderComponent={
          <PageWidth className="gap-lg pb-lg">
            {isOffline ? (
              <OfflineBanner
                label={t('knowledge:playerOffline')}
                languageFontClass={languageFontClass}
              />
            ) : null}
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
        }
        ListEmptyComponent={
          <PageWidth>
            <AnnouncementEmptyState
              title={t('knowledge:playerEmptyTitle')}
              body={t('knowledge:playerEmptyBody')}
              languageFontClass={languageFontClass}
            />
          </PageWidth>
        }
      />
    </>
  );
}
