import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { PageWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { useCommunityStories } from '@/lib/community-stories';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePersonCards } from '@/lib/person-cards';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
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
 * (RAPP-792). Each story opens the shared reader `knowledge/[id]`.
 */
export function CommunityStoryList({
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
  const query = useCommunityStories();
  const authorIds = useMemo(
    () => (query.data ?? EMPTY_STORIES).map((story) => story.author_id),
    [query.data],
  );
  const personCards = usePersonCards(authorIds);
  const refetchStories = query.refetch;
  const accessToken = session?.access_token;
  const openStory = useCallback(
    (id: string) => push({ pathname: '/knowledge/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const refresh = useCallback(() => void refetchStories(), [refetchStories]);
  const renderStory = useCallback(
    ({ item, index }: ListRenderItemInfo<KnowledgeArticleListRow>) => (
      <PageWidth className="pb-md">
        <FadeSlideIn index={index}>
          <KnowledgeArticleCard
            article={item}
            accessToken={accessToken}
            onOpen={openStory}
            authorAvatarKey={
              item.author_id === null ? null : (personCards.get(item.author_id)?.avatarKey ?? null)
            }
          />
        </FadeSlideIn>
      </PageWidth>
    ),
    [accessToken, openStory, personCards],
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
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
      ListEmptyComponent={emptyState}
      refreshing={query.isRefetching && isOnline}
      onRefresh={refresh}
    />
  );
}
