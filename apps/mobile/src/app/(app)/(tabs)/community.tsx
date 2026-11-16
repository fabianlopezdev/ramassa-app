import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import {
  CommunityShareSheet,
  type CommunityShareChoice,
} from '@/components/community/community-share-sheet';
import { ForumCategoryTabs } from '@/components/forum/forum-category-tabs';
import { ForumPostCard } from '@/components/forum/forum-post-card';
import { GalleryGrid } from '@/components/gallery/gallery-grid';
import { CommunityStoryList } from '@/components/knowledge/community-story-list';
import { PageWidth } from '@/components/layout/content-width';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/layout/segmented-control';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePersonCards } from '@/lib/person-cards';
import { useForumCategories, useForumPosts } from '@/lib/player-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import {
  filterForumPostsByCategory,
  type ForumCategoryRow,
  type ForumPostRow,
} from '@ramassa/shared/forum';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_POSTS: readonly ForumPostRow[] = [];
const EMPTY_CATEGORIES: readonly ForumCategoryRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  content: { paddingBottom: tokens.spacing['3xl'], paddingHorizontal: tokens.spacing.lg },
});
const postKeyExtractor = (post: ForumPostRow) => post.id;
const shareSymbol: SymbolViewProps['name'] = {
  ios: 'plus.circle.fill',
  android: 'add_circle',
  web: 'add_circle',
};
const forumSymbol: SymbolViewProps['name'] = {
  ios: 'bubble.left.and.bubble.right.fill',
  android: 'forum',
  web: 'forum',
};
const gallerySymbol: SymbolViewProps['name'] = {
  ios: 'photo.on.rectangle.angled',
  android: 'photo_library',
  web: 'photo_library',
};
const storiesSymbol: SymbolViewProps['name'] = {
  ios: 'book.fill',
  android: 'auto_stories',
  web: 'auto_stories',
};
type CommunitySegment = 'forum' | 'gallery' | 'stories';
const shareRoutes: Readonly<Record<CommunityShareChoice, Href>> = {
  post: '/forum/create' as Href,
  media: '/gallery/upload' as Href,
  story: '/story/submit' as Href,
};

export default function CommunityScreen() {
  const { t } = useTranslation(['forum', 'errors']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const categoriesQuery = useForumCategories();
  const postsQuery = useForumPosts();
  const refetchCategories = categoriesQuery.refetch;
  const refetchPosts = postsQuery.refetch;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [segment, setSegment] = useState<CommunitySegment>('forum');
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const posts = useMemo(
    () => filterForumPostsByCategory(postsQuery.data ?? EMPTY_POSTS, categoryId),
    [categoryId, postsQuery.data],
  );
  // One lookup for every author in the feed: the team's photos (RAPP-639).
  const authorIds = useMemo(
    () => (postsQuery.data ?? EMPTY_POSTS).map((post) => post.author_id),
    [postsQuery.data],
  );
  const personCards = usePersonCards(authorIds);
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
  const openShareSheet = useCallback(() => setIsShareSheetOpen(true), []);
  const closeShareSheet = useCallback(() => setIsShareSheetOpen(false), []);
  const chooseShare = useCallback(
    (choice: CommunityShareChoice) => {
      setIsShareSheetOpen(false);
      push(shareRoutes[choice]);
    },
    [push],
  );
  const segmentOptions = useMemo<readonly SegmentedControlOption<CommunitySegment>[]>(
    () => [
      {
        key: 'forum',
        label: t('forum:segmentForum'),
        symbol: forumSymbol,
        testID: 'community-segment-forum',
      },
      {
        key: 'gallery',
        label: t('forum:segmentGallery'),
        symbol: gallerySymbol,
        testID: 'community-segment-gallery',
      },
      {
        key: 'stories',
        label: t('forum:segmentStories'),
        symbol: storiesSymbol,
        testID: 'community-segment-stories',
      },
    ],
    [t],
  );
  const openLinkLabel = useCallback((url: string) => t('forum:openLink', { url }), [t]);
  const refresh = useCallback(() => {
    void Promise.all([refetchCategories(), refetchPosts()]);
  }, [refetchCategories, refetchPosts]);
  const renderPost = useCallback(
    ({ item, index }: ListRenderItemInfo<ForumPostRow>) => (
      <PageWidth className="pb-md">
        <FadeSlideIn index={index}>
          <ForumPostCard
            post={item}
            authorLabel={t('forum:postBy', { name: item.author_first_name })}
            authorAvatarKey={personCards.get(item.author_id)?.avatarKey ?? null}
            repliesLabel={t('forum:repliesCount', { count: item.reply_count })}
            pinnedLabel={t('forum:pinned')}
            imageAlt={t('forum:imageAlt', { name: item.author_first_name })}
            accessibilityLabel={t('forum:openPost', { name: item.author_first_name })}
            languageFontClass={languageFontClass}
            accessToken={session?.access_token}
            openLinkLabel={openLinkLabel}
            onOpen={openPost}
          />
        </FadeSlideIn>
      </PageWidth>
    ),
    [languageFontClass, openLinkLabel, openPost, session?.access_token, personCards, t],
  );

  const loadError = categoriesQuery.error ?? postsQuery.error;
  let forumEmptyState: ReactElement;
  if ((categoriesQuery.isPending || postsQuery.isPending) && postsQuery.data === undefined) {
    forumEmptyState = <AnnouncementFeedSkeleton accessibilityLabel={t('forum:loading')} />;
  } else if (loadError !== null && postsQuery.data === undefined) {
    forumEmptyState = (
      <AnnouncementFeedError
        message={t('forum:loadFailed')}
        retryLabel={t('forum:retry')}
        code={toAppError(loadError).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
      />
    );
  } else {
    forumEmptyState = (
      <PageWidth>
        <AnnouncementEmptyState
          title={t('forum:emptyTitle')}
          body={t('forum:emptyBody')}
          languageFontClass={languageFontClass}
        />
      </PageWidth>
    );
  }

  // One header for every segment; forum category chips show only in the
  // Fòrum segment, so the screen never stacks two filter rows (plan P4).
  const header = (
    <View className="gap-lg pb-lg">
      <PageWidth className="gap-md">
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {t('forum:title')}
        </Text>
        {isOffline ? (
          <OfflineBanner label={t('forum:offline')} languageFontClass={languageFontClass} />
        ) : null}
        <PressableScale
          testID="community-share"
          accessibilityLabel={t('forum:share')}
          onPress={openShareSheet}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended flex-row items-center justify-center gap-sm rounded-md bg-primary px-lg"
        >
          <SymbolView
            accessible={false}
            name={shareSymbol}
            size={tokens.fontSize.xl}
            tintColor={tokens.colors.white}
          />
          <Text className={`text-md font-bold text-white ${languageFontClass}`}>
            {t('forum:share')}
          </Text>
        </PressableScale>
        <SegmentedControl
          testID="community-segments"
          options={segmentOptions}
          selected={segment}
          onSelect={setSegment}
          accessibilityLabel={t('forum:segmentsLabel')}
          languageFontClass={languageFontClass}
        />
      </PageWidth>
      {segment === 'forum' ? (
        <ForumCategoryTabs
          categories={categoriesQuery.data ?? EMPTY_CATEGORIES}
          selectedId={categoryId}
          allLabel={t('forum:allCategories')}
          accessibilityLabel={t('forum:categoriesLabel')}
          onSelect={setCategoryId}
        />
      ) : null}
    </View>
  );

  let segmentList: ReactElement;
  if (segment === 'gallery') {
    segmentList = <GalleryGrid header={header} contentContainerStyle={contentStyle} />;
  } else if (segment === 'stories') {
    segmentList = <CommunityStoryList header={header} contentContainerStyle={contentStyle} />;
  } else {
    segmentList = (
      <FlashList
        testID="forum-board"
        data={posts}
        renderItem={renderPost}
        keyExtractor={postKeyExtractor}
        style={styles.screen}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={postsQuery.isRefetching && !isOffline}
        onRefresh={refresh}
        ListHeaderComponent={header}
        ListEmptyComponent={forumEmptyState}
      />
    );
  }

  return (
    <>
      {segmentList}
      <CommunityShareSheet
        visible={isShareSheetOpen}
        isPostDisabled={isOffline}
        onChoose={chooseShare}
        onClose={closeShareSheet}
      />
    </>
  );
}
