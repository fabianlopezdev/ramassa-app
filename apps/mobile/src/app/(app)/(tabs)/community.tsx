import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { ForumCategoryTabs } from '@/components/forum/forum-category-tabs';
import { ForumPostCard } from '@/components/forum/forum-post-card';
import { PageWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useForumCategories, useForumPosts } from '@/lib/player-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { filterForumPostsByCategory, type ForumPostRow } from '@ramassa/shared/forum';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_POSTS: readonly ForumPostRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  content: { paddingBottom: tokens.spacing['3xl'], paddingHorizontal: tokens.spacing.lg },
});
const postKeyExtractor = (post: ForumPostRow) => post.id;

export default function CommunityScreen() {
  const { t } = useTranslation(['forum', 'errors']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const insets = useSafeAreaInsets();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const categoriesQuery = useForumCategories();
  const postsQuery = useForumPosts();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const posts = useMemo(
    () => filterForumPostsByCategory(postsQuery.data ?? EMPTY_POSTS, categoryId),
    [categoryId, postsQuery.data],
  );
  const contentStyle = useMemo(
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
  const openPost = useCallback(
    (id: string) => push({ pathname: '/forum/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const createPost = useCallback(() => push('/forum/create' as Href), [push]);
  const openTeamChat = useCallback(() => push('/team-chat' as Href), [push]);
  const openLinkLabel = useCallback((url: string) => t('forum:openLink', { url }), [t]);
  const refresh = useCallback(() => {
    void Promise.all([categoriesQuery.refetch(), postsQuery.refetch()]);
  }, [categoriesQuery, postsQuery]);
  const renderPost = useCallback(
    ({ item, index }: ListRenderItemInfo<ForumPostRow>) => (
      <PageWidth className="pb-md">
        <FadeSlideIn index={index}>
          <ForumPostCard
            post={item}
            authorLabel={t('forum:postBy', { name: item.author_first_name })}
            repliesLabel={t('forum:repliesCount', { count: item.reply_count })}
            pinnedLabel={t('forum:pinned')}
            imageAlt={t('forum:imageAlt', { name: item.author_first_name })}
            accessibilityLabel={t('forum:openPost', { name: item.author_first_name })}
            languageFontClass={languageFontClass}
            openLinkLabel={openLinkLabel}
            onOpen={openPost}
          />
        </FadeSlideIn>
      </PageWidth>
    ),
    [languageFontClass, openLinkLabel, openPost, t],
  );

  if ((categoriesQuery.isPending || postsQuery.isPending) && postsQuery.data === undefined) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('forum:loading')} />;
  }
  const loadError = categoriesQuery.error ?? postsQuery.error;
  if (loadError !== null && postsQuery.data === undefined) {
    return (
      <AnnouncementFeedError
        message={t('forum:loadFailed')}
        retryLabel={t('forum:retry')}
        code={toAppError(loadError).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
      />
    );
  }

  return (
    <FlashList
      testID="forum-board"
      accessibilityRole="list"
      accessibilityLabel={t('forum:title')}
      data={posts}
      renderItem={renderPost}
      keyExtractor={postKeyExtractor}
      style={styles.screen}
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={postsQuery.isRefetching && !isOffline}
      onRefresh={refresh}
      ListHeaderComponent={
        <View className="gap-lg pb-lg">
          <PageWidth className="gap-md">
            <View className="gap-xs">
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('forum:title')}
              </Text>
              <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                {t('forum:intro')}
              </Text>
            </View>
            {isOffline ? (
              <OfflineBanner label={t('forum:offline')} languageFontClass={languageFontClass} />
            ) : null}
            <View className="flex-row flex-wrap gap-sm">
              <PressableScale
                testID="forum-new-post"
                accessibilityLabel={t('forum:newPost')}
                onPress={createPost}
                haptic="tapLight"
                isDisabled={isOffline}
                style={continuousCorners}
                className="min-h-recommended grow items-center justify-center rounded-md bg-primary px-lg"
              >
                <Text className={`text-md font-bold text-white ${languageFontClass}`}>
                  {t('forum:newPost')}
                </Text>
              </PressableScale>
              <PressableScale
                testID="forum-open-team-chat"
                accessibilityLabel={t('forum:teamChat')}
                onPress={openTeamChat}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended grow items-center justify-center rounded-md border border-primary px-lg"
              >
                <Text className={`text-center text-md font-bold text-primary ${languageFontClass}`}>
                  {t('forum:teamChat')}
                </Text>
              </PressableScale>
            </View>
          </PageWidth>
          <ForumCategoryTabs
            categories={categoriesQuery.data ?? []}
            selectedId={categoryId}
            allLabel={t('forum:allCategories')}
            accessibilityLabel={t('forum:categoriesLabel')}
            onSelect={setCategoryId}
          />
        </View>
      }
      ListEmptyComponent={
        <PageWidth>
          <AnnouncementEmptyState
            title={t('forum:emptyTitle')}
            body={t('forum:emptyBody')}
            languageFontClass={languageFontClass}
          />
        </PageWidth>
      }
    />
  );
}
