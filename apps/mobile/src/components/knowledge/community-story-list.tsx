import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { OwnStoryStatuses } from '@/components/knowledge/own-story-statuses';
import { PageWidth } from '@/components/layout/content-width';
import { NO_UNOPENED_IDS } from '@/lib/community-news';
import { useCommunityStories } from '@/lib/community-stories';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePersonCards } from '@/lib/person-cards';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useListSeen, useTabNews } from '@/lib/use-tab-news';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import type { Href } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_STORIES: readonly KnowledgeArticleListRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
});
const keyExtractor = (story: KnowledgeArticleListRow) => story.id;

/**
 * Published participant stories, the Històries segment of Comunitat
 * (RAPP-792). Each story opens the shared reader `knowledge/[id]`. Her own
 * stories still waiting for the team sit above them (RAPP-890).
 */
export function CommunityStoryList({
  header,
  contentContainerStyle,
  unopenedArticleIds = NO_UNOPENED_IDS,
}: {
  readonly header: ReactElement;
  readonly contentContainerStyle: StyleProp<ViewStyle>;
  /** Stories she has not opened yet, marked "Nou" until she does (RAPP-873). */
  readonly unopenedArticleIds?: ReadonlySet<string>;
}) {
  const { t } = useTranslation(['knowledge', 'home']);
  const languageFontClass = useLanguageFontClass();
  const { session } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const query = useCommunityStories();
  // Seeing the stories clears their number; a list still loading has shown
  // nothing (RAPP-873).
  useListSeen('stories', query.data !== undefined);
  const authorIds = useMemo(
    () => (query.data ?? EMPTY_STORIES).map((story) => story.author_id),
    [query.data],
  );
  const personCards = usePersonCards(authorIds);
  const refetchStories = query.refetch;
  // Pull to refresh also asks again what is new for her (RAPP-873).
  const refetchTabNews = useTabNews().refetch;
  const accessToken = session?.access_token;
  const refresh = useCallback(() => {
    void Promise.all([refetchStories(), refetchTabNews()]);
  }, [refetchStories, refetchTabNews]);
  const listHeader = (
    <View>
      {header}
      <PageWidth className="pb-lg">
        <OwnStoryStatuses />
      </PageWidth>
    </View>
  );
  const renderStory = useCallback(
    ({ item }: ListRenderItemInfo<KnowledgeArticleListRow>) => (
      <PageWidth className="pb-md">
        <KnowledgeArticleCard
          article={item}
          accessToken={accessToken}
          href={`/knowledge/${item.id}` as Href}
          authorAvatarKey={
            item.author_id === null ? null : (personCards.get(item.author_id)?.avatarKey ?? null)
          }
          unseenLabel={unopenedArticleIds.has(item.id) ? t('home:unseen') : null}
        />
      </PageWidth>
    ),
    [accessToken, personCards, t, unopenedArticleIds],
  );

  let emptyState: ReactElement;
  if (query.isPending && query.data === undefined && isOnline) {
    emptyState = <AnnouncementFeedSkeleton accessibilityLabel={t('communityStoriesLoading')} />;
  } else if (query.isError && query.data === undefined) {
    emptyState = (
      <AnnouncementFeedError
        message={t('communityStoriesLoadFailed')}
        retryLabel={t('playerRetry')}
        code={toAppError(query.error).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
        isLoading={query.isRefetching}
      />
    );
  } else {
    emptyState = (
      <PageWidth>
        <AnnouncementEmptyState
          title={t('communityStoriesEmptyTitle')}
          body={t('communityStoriesEmptyBody')}
          languageFontClass={languageFontClass}
        />
      </PageWidth>
    );
  }

  return (
    <FlashList
      testID="community-stories"
      data={query.data ?? EMPTY_STORIES}
      renderItem={renderStory}
      keyExtractor={keyExtractor}
      extraData={unopenedArticleIds}
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={listHeader}
      ListEmptyComponent={emptyState}
      refreshing={query.isRefetching && isOnline}
      onRefresh={refresh}
    />
  );
}
