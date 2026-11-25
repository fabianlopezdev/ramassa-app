import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { GuideCategoryGrid } from '@/components/knowledge/guide-category-grid';
import { PageWidth } from '@/components/layout/content-width';
import { ScreenSection } from '@/components/layout/screen-section';
import { useAjudaRefresh } from '@/lib/ajuda-refresh';
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
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toAppError } from '@ramassa/shared/errors';

/**
 * The Guies view of the Ajuda tab (RAPP-851), built like Serveis
 * (RAPP-870): the guide categories as the shared tiles, only those with a
 * guide. A tile opens that category's guides as a screen of its own
 * (`guides/[categoryId]`), with the back arrow every pushed screen has. The
 * tab draws it under its own header inside its one scrolling page, so the
 * header stays on screen while the guides load (RAPP-977).
 */
export function PlayerGuideList() {
  const { t } = useTranslation('knowledge');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const categoriesQuery = usePlayerKnowledgeCategories();
  const articlesQuery = usePlayerKnowledgeArticles();
  const { refresh, isRefreshing } = useAjudaRefresh();
  // A tile counts the guides she has not seen in its category's list (RAPP-873).
  const { data: news } = useTabNews();
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
  const isLoading =
    ((categoriesQuery.isPending && categoriesQuery.data === undefined) ||
      (articlesQuery.isPending && articlesQuery.data === undefined)) &&
    isOnline;
  const loadError = categoriesQuery.error ?? articlesQuery.error;
  const hasNoData = categoriesQuery.data === undefined && articlesQuery.data === undefined;
  if (isLoading) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('guidesLoading')} />;
  }
  if (loadError !== null && hasNoData) {
    return (
      <AnnouncementFeedError
        message={t('playerLoadFailed')}
        retryLabel={t('playerRetry')}
        code={toAppError(loadError).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
        isLoading={isRefreshing}
      />
    );
  }
  if (guides.length === 0) {
    return (
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
