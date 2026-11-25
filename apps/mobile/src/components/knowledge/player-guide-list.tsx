import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { GuideCategoryGrid } from '@/components/knowledge/guide-category-grid';
import { PageWidth } from '@/components/layout/content-width';
import { ScreenSection } from '@/components/layout/screen-section';
import { countUnseenHelpItems, NO_HELP_NUMBERS } from '@/lib/help-news';
import { isNetworkStateOnline } from '@/lib/network-status';
import {
  countPlayerGuidesByCategory,
  selectGuideCategories,
  selectPlayerGuides,
  withoutBaseDocuments,
} from '@/lib/player-guides';
import { usePlayerKnowledgeArticles, usePlayerKnowledgeCategories } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTabNews } from '@/lib/use-tab-news';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
});

/**
 * The Guies segment of the Ajuda tab (RAPP-851), built like Serveis
 * (RAPP-870): the guide categories as the shared tiles, only those with a
 * guide. A tile opens that category's guides as a screen of its own
 * (`guides/[categoryId]`), with the back arrow every pushed screen has. The
 * tab passes its header (title and segments) so it stays on screen while the
 * guides load.
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
  const isOnline = isNetworkStateOnline(useNetworkState());
  const categoriesQuery = usePlayerKnowledgeCategories();
  const articlesQuery = usePlayerKnowledgeArticles();
  const { refetch: refetchCategories } = categoriesQuery;
  const { refetch: refetchArticles } = articlesQuery;
  // A tile counts the guides she has not seen in its category's list (RAPP-873).
  const { data: news, refetch: refetchNews } = useTabNews();
  const guideNews = useMemo(
    () => (news === undefined ? NO_HELP_NUMBERS : countUnseenHelpItems(news.guides.unseenArticles)),
    [news],
  );
  // The base documents have their own segment (RAPP-972).
  const guides = useMemo(
    () => withoutBaseDocuments(selectPlayerGuides(articlesQuery.data)),
    [articlesQuery.data],
  );
  const counts = useMemo(() => countPlayerGuidesByCategory(guides), [guides]);
  const guideCategories = useMemo(
    () => selectGuideCategories(categoriesQuery.data, counts),
    [categoriesQuery.data, counts],
  );
  const openCategory = useCallback(
    (categoryId: string) =>
      push({ pathname: '/guides/[categoryId]', params: { categoryId } } as unknown as Href),
    [push],
  );
  const refresh = useCallback(() => {
    void Promise.all([refetchCategories(), refetchArticles(), refetchNews()]);
  }, [refetchArticles, refetchCategories, refetchNews]);

  const isLoading =
    ((categoriesQuery.isPending && categoriesQuery.data === undefined) ||
      (articlesQuery.isPending && articlesQuery.data === undefined)) &&
    isOnline;
  const loadError = categoriesQuery.error ?? articlesQuery.error;
  const hasNoData = categoriesQuery.data === undefined && articlesQuery.data === undefined;
  let body: ReactElement;
  if (isLoading) {
    body = <AnnouncementFeedSkeleton accessibilityLabel={t('guidesLoading')} />;
  } else if (loadError !== null && hasNoData) {
    body = (
      <AnnouncementFeedError
        message={t('playerLoadFailed')}
        retryLabel={t('playerRetry')}
        code={toAppError(loadError).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
        isLoading={categoriesQuery.isRefetching || articlesQuery.isRefetching}
      />
    );
  } else if (guides.length === 0) {
    body = (
      <PageWidth>
        <AnnouncementEmptyState
          title={t('playerEmptyTitle')}
          body={t('playerEmptyBody')}
          languageFontClass={languageFontClass}
        />
      </PageWidth>
    );
  } else {
    body = (
      <PageWidth>
        <ScreenSection title={t('categoriesHeading')} isLast>
          <GuideCategoryGrid
            categories={guideCategories}
            newCounts={guideNews.countsByCategoryId}
            onSelect={openCategory}
          />
        </ScreenSection>
      </PageWidth>
    );
  }

  return (
    <ScrollView
      testID="knowledge-base-screen"
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={(categoriesQuery.isRefetching || articlesQuery.isRefetching) && isOnline}
          onRefresh={refresh}
        />
      }
    >
      <View className="gap-lg">
        {header}
        {body}
      </View>
    </ScrollView>
  );
}
