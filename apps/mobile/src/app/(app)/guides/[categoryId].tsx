/**
 * The guides of one Ajuda category (RAPP-870), opened from its tile in Guies.
 * A pushed screen like every other: the native back arrow and the category's
 * name in the header, on the wash of the category's colour (RAPP-868), the
 * same shade as its icon circle. Each guide opens `knowledge/[id]`.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { NO_HELP_NEWS, summarizeHelpNews } from '@/lib/help-news';
import { isNetworkStateOnline } from '@/lib/network-status';
import { filterPlayerGuides, selectPlayerGuides } from '@/lib/player-guides';
import { usePlayerKnowledgeArticles, usePlayerKnowledgeCategories } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTabNews } from '@/lib/use-tab-news';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { categoryWash } from '@ramassa/shared/category-colors';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing['3xl'],
  },
});
const keyExtractor = (article: KnowledgeArticleListRow) => article.id;

export default function GuideCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { t } = useTranslation(['knowledge', 'home']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { session } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const categoriesQuery = usePlayerKnowledgeCategories();
  const articlesQuery = usePlayerKnowledgeArticles();
  const accessToken = session?.access_token;
  const category = categoriesQuery.data?.find((candidate) => candidate.id === categoryId);
  const title =
    category === undefined ? '' : (resolveLocalizedText(category.name, language)?.text ?? '');
  const wash = category === undefined ? undefined : categoryWash(category.color);
  const screenStyle = useMemo(
    () => (wash === undefined ? styles.screen : { ...styles.screen, backgroundColor: wash }),
    [wash],
  );
  const guides = useMemo(
    () => filterPlayerGuides(selectPlayerGuides(articlesQuery.data), categoryId ?? ''),
    [articlesQuery.data, categoryId],
  );
  const openGuide = useCallback(
    (id: string) => push({ pathname: '/knowledge/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const { refetch: refetchArticles } = articlesQuery;
  // A guide keeps "Nou" until she opens it, also after she comes back (RAPP-873).
  const { data: news, refetch: refetchNews } = useTabNews();
  const newGuideIds = useMemo(
    () =>
      (news === undefined ? NO_HELP_NEWS : summarizeHelpNews(news.guides.unopenedArticles)).newIds,
    [news],
  );
  const refresh = useCallback(() => {
    void Promise.all([refetchArticles(), refetchNews()]);
  }, [refetchArticles, refetchNews]);
  const renderGuide = useCallback(
    ({ item, index }: ListRenderItemInfo<KnowledgeArticleListRow>) => (
      <PageWidth className="pb-md">
        <FadeSlideIn index={index}>
          <KnowledgeArticleCard
            article={item}
            accessToken={accessToken}
            onOpen={openGuide}
            showsCategory={false}
            unseenLabel={newGuideIds.has(item.id) ? t('home:unseen') : null}
          />
        </FadeSlideIn>
      </PageWidth>
    ),
    [accessToken, newGuideIds, openGuide, t],
  );

  let emptyState: ReactElement;
  if (articlesQuery.isPending && articlesQuery.data === undefined && isOnline) {
    emptyState = <AnnouncementFeedSkeleton accessibilityLabel={t('guidesLoading')} />;
  } else if (articlesQuery.isError && articlesQuery.data === undefined) {
    emptyState = (
      <AnnouncementFeedError
        message={t('playerLoadFailed')}
        retryLabel={t('playerRetry')}
        code={toAppError(articlesQuery.error).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
        isLoading={articlesQuery.isRefetching}
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
    <>
      <NativeScreenHeader title={title} backgroundColor={wash} />
      <FlashList
        testID="guide-category-screen"
        data={guides}
        renderItem={renderGuide}
        keyExtractor={keyExtractor}
        extraData={newGuideIds}
        style={screenStyle}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={articlesQuery.isRefetching && isOnline}
        onRefresh={refresh}
        ListEmptyComponent={emptyState}
      />
    </>
  );
}
