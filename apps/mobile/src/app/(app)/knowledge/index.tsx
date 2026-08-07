import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import {
  KnowledgeCategoryGrid,
  type PlayerKnowledgeFilter,
} from '@/components/knowledge/knowledge-category-grid';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePlayerKnowledgeArticles, usePlayerKnowledgeCategories } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_ARTICLES: readonly KnowledgeArticleListRow[] = [];
const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: tokens.colors.white },
  content: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing['3xl'] },
});

const keyExtractor = (article: KnowledgeArticleListRow) => article.id;
const getItemType = (article: KnowledgeArticleListRow) => article.content_type;

export default function PlayerKnowledgeScreen() {
  const { t } = useTranslation(['knowledge', 'common']);
  const { back, push } = useRouter();
  const { session } = useAuth();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const [filter, setFilter] = useState<PlayerKnowledgeFilter>('all');
  const categoriesQuery = usePlayerKnowledgeCategories();
  const articlesQuery = usePlayerKnowledgeArticles();
  const { refetch: refetchCategories } = categoriesQuery;
  const { refetch: refetchArticles } = articlesQuery;
  const articles = articlesQuery.data ?? EMPTY_ARTICLES;

  const visibleArticles = useMemo(() => {
    if (filter === 'all') return articles;
    if (filter === 'stories') {
      return articles.filter((article) => article.content_type === 'participant_story');
    }
    return articles.filter((article) => article.category_id === filter);
  }, [articles, filter]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: articles.length, stories: 0 };
    for (const article of articles) {
      result[article.category_id] = (result[article.category_id] ?? 0) + 1;
      if (article.content_type === 'participant_story') result.stories = (result.stories ?? 0) + 1;
    }
    return result;
  }, [articles]);

  const openStory = useCallback(() => push('/story/submit' as Href), [push]);
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
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing['3xl'],
          }
        : { paddingTop: tokens.spacing.lg },
    ],
    [insets.bottom, insets.top],
  );

  if (
    (categoriesQuery.isPending && categoriesQuery.data === undefined) ||
    (articlesQuery.isPending && articlesQuery.data === undefined)
  ) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('knowledge:playerLoading')} />;
  }
  const loadError = categoriesQuery.error ?? articlesQuery.error;
  if (
    loadError !== null &&
    categoriesQuery.data === undefined &&
    articlesQuery.data === undefined
  ) {
    return (
      <AnnouncementFeedError
        message={t('knowledge:playerLoadFailed')}
        retryLabel={t('knowledge:playerRetry')}
        code={toAppError(loadError).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
      />
    );
  }

  return (
    <FlashList
      testID="knowledge-base-screen"
      accessibilityRole="list"
      accessibilityLabel={t('knowledge:playerTitle')}
      data={visibleArticles}
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
          <PressableScale
            accessibilityLabel={t('common:back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
          >
            <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
              {t('common:back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('knowledge:playerTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('knowledge:playerIntro')}
            </Text>
          </View>
          {isOffline ? (
            <OfflineBanner
              label={t('knowledge:playerOffline')}
              languageFontClass={languageFontClass}
            />
          ) : null}
          <KnowledgeCategoryGrid
            categories={categoriesQuery.data ?? []}
            selected={filter}
            counts={counts}
            onSelect={setFilter}
          />
          <PressableScale
            testID="knowledge-share-story"
            accessibilityLabel={`${t('knowledge:quickStoryTitle')}. ${t('knowledge:quickStoryBody')}`}
            onPress={openStory}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${languageFontClass}`}>
              {t('knowledge:quickStoryTitle')}
            </Text>
          </PressableScale>
          <Text
            className={`text-start text-sm font-semibold tabular-nums text-neutral-600 ${languageFontClass}`}
          >
            {t('knowledge:resourcesCount', { count: visibleArticles.length })}
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
  );
}
