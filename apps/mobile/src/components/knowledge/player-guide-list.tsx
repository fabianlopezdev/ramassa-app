import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { GuideCategoryGrid } from '@/components/knowledge/guide-category-grid';
import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { BackToCategoriesButton } from '@/components/layout/back-to-categories-button';
import { PageWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { isNetworkStateOnline } from '@/lib/network-status';
import {
  countPlayerGuidesByCategory,
  filterPlayerGuides,
  selectGuideCategories,
  selectPlayerGuides,
} from '@/lib/player-guides';
import { usePlayerKnowledgeArticles, usePlayerKnowledgeCategories } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { categoryWash } from '@ramassa/shared/category-colors';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
});
const NO_GUIDES: readonly KnowledgeArticleListRow[] = [];
const keyExtractor = (article: KnowledgeArticleListRow) => article.id;
const getItemType = (article: KnowledgeArticleListRow) => article.content_type;

/**
 * The Guies segment of the Ajuda tab (RAPP-851), built like Serveis
 * (RAPP-870): first the guide categories as the shared tiles, only those with
 * a guide; a tile opens that category's guides on the wash of its colour,
 * with the shared button back to the tiles. The tab passes its header (title
 * and segments) so it stays on screen while the guides load. Each guide opens
 * `knowledge/[id]`.
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
  const { language } = useLanguage();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categoriesQuery = usePlayerKnowledgeCategories();
  const articlesQuery = usePlayerKnowledgeArticles();
  const { refetch: refetchCategories } = categoriesQuery;
  const { refetch: refetchArticles } = articlesQuery;
  const accessToken = session?.access_token;
  const guides = useMemo(() => selectPlayerGuides(articlesQuery.data), [articlesQuery.data]);
  const counts = useMemo(() => countPlayerGuidesByCategory(guides), [guides]);
  const guideCategories = useMemo(
    () => selectGuideCategories(categoriesQuery.data, counts),
    [categoriesQuery.data, counts],
  );
  const category = guideCategories.find((candidate) => candidate.id === categoryId) ?? null;
  const categoryName =
    category === null ? undefined : resolveLocalizedText(category.name, language);
  const visibleGuides = useMemo(
    () => (category === null ? NO_GUIDES : filterPlayerGuides(guides, category.id)),
    [category, guides],
  );
  // An open category sits on the wash of its own colour, like Serveis (RAPP-856).
  const openCategoryWash = category === null ? undefined : categoryWash(category.color);
  const screenStyle = useMemo(
    () =>
      openCategoryWash === undefined
        ? styles.screen
        : { ...styles.screen, backgroundColor: openCategoryWash },
    [openCategoryWash],
  );
  const backToCategories = useCallback(() => setCategoryId(null), []);
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
          <KnowledgeArticleCard
            article={item}
            accessToken={accessToken}
            onOpen={openGuide}
            showsCategory={false}
          />
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
  let emptyState: ReactElement | null;
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
  } else if (guides.length > 0) {
    // The tiles in the header are the content until she opens a category.
    emptyState = null;
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
      extraData={categoryId}
      style={screenStyle}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={(categoriesQuery.isRefetching || articlesQuery.isRefetching) && isOnline}
      onRefresh={refresh}
      ListHeaderComponent={
        <>
          {header}
          {guides.length === 0 ? null : category === null || categoryName === undefined ? (
            <PageWidth className="gap-md pb-lg">
              <Text
                accessibilityRole="header"
                className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('categoriesHeading')}
              </Text>
              <GuideCategoryGrid categories={guideCategories} onSelect={setCategoryId} />
            </PageWidth>
          ) : (
            <PageWidth className="gap-lg pb-lg">
              <BackToCategoriesButton testID="guides-show-categories" onPress={backToCategories} />
              <View className="gap-xs">
                <Text
                  accessibilityRole="header"
                  className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {categoryName.text}
                </Text>
                <Text
                  className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
                >
                  {t('guidesCount', { count: visibleGuides.length })}
                </Text>
              </View>
            </PageWidth>
          )}
        </>
      }
      ListEmptyComponent={emptyState}
    />
  );
}
