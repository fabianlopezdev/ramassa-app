import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { ForumCategoryFilters } from '@/components/forum/forum-category-tabs';
import { ForumPostCard } from '@/components/forum/forum-post-card';
import { GalleryGrid } from '@/components/gallery/gallery-grid';
import { CommunityStoryList } from '@/components/knowledge/community-story-list';
import { PageWidth } from '@/components/layout/content-width';
import { raisedToneFromColorName, type RaisedTone } from '@/components/layout/raised-surface';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/layout/segmented-control';
import { TabScreenAction } from '@/components/layout/tab-screen-action';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PlayerTabHeader } from '@/components/profile/player-tab-header';
import { communitySegmentCounts, forumPostNews, toNewIdSet } from '@/lib/community-news';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePersonCards } from '@/lib/person-cards';
import { useForumCategories, useForumPosts } from '@/lib/player-forum';
import { formatUnreadBadge } from '@/lib/unread-badge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { useTabNews } from '@/lib/use-tab-news';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import {
  filterForumPostsByCategory,
  type ForumCategoryRow,
  type ForumPostRow,
} from '@ramassa/shared/forum';
import { EMPTY_TAB_NEWS } from '@ramassa/shared/tab-news';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_POSTS: readonly ForumPostRow[] = [];
const EMPTY_CATEGORIES: readonly ForumCategoryRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
  content: { paddingBottom: tokens.spacing['3xl'], paddingHorizontal: tokens.spacing.lg },
});
const postKeyExtractor = (post: ForumPostRow) => post.id;
type CommunitySegment = 'forum' | 'gallery' | 'stories';
/**
 * The pinned button opens the form of the section on show (RAPP-858), with
 * its own words, so she never has to pick again what she already picked.
 */
const shareActions: Readonly<
  Record<CommunitySegment, { readonly route: Href; readonly labelKey: string }>
> = {
  forum: { route: '/forum/create' as Href, labelKey: 'forum:shareForum' },
  gallery: { route: '/gallery/upload' as Href, labelKey: 'forum:shareGallery' },
  stories: { route: '/story/submit' as Href, labelKey: 'forum:shareStories' },
};

export default function CommunityScreen() {
  const { t } = useTranslation(['forum', 'errors', 'nav', 'common', 'home']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { session } = useAuth();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const categoriesQuery = useForumCategories();
  const postsQuery = useForumPosts();
  const refetchCategories = categoriesQuery.refetch;
  const refetchPosts = postsQuery.refetch;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [segment, setSegment] = useState<CommunitySegment>('forum');
  // The live news gives the numbers on the switch and the "Nou" on each card. A
  // thing stays new until she opens it; opening a section clears nothing (RAPP-873).
  const tabNewsQuery = useTabNews();
  const refetchTabNews = tabNewsQuery.refetch;
  const segmentCounts = useMemo(
    () => communitySegmentCounts(tabNewsQuery.data),
    [tabNewsQuery.data],
  );
  const forumVisit = tabNewsQuery.data?.forum ?? EMPTY_TAB_NEWS.forum;
  const galleryVisit = tabNewsQuery.data?.gallery ?? EMPTY_TAB_NEWS.gallery;
  const storiesVisit = tabNewsQuery.data?.stories ?? EMPTY_TAB_NEWS.stories;
  const galleryNewItemIds = useMemo(() => toNewIdSet(galleryVisit.newItemIds), [galleryVisit]);
  const storiesNewArticleIds = useMemo(
    () => toNewIdSet(storiesVisit.newArticleIds),
    [storiesVisit],
  );
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
  // Each category's colour, which tints its pill and its posts (RAPP-852).
  const toneByCategoryId = useMemo<Readonly<Record<string, RaisedTone | undefined>>>(
    () =>
      Object.fromEntries(
        (categoriesQuery.data ?? EMPTY_CATEGORIES).map((category) => [
          category.id,
          raisedToneFromColorName(category.color),
        ]),
      ),
    [categoriesQuery.data],
  );
  const tabInsets = usePlayerTabContentInsets();
  // Share is pinned above the tab bar; the list keeps its height free at the end.
  const [shareActionHeight, setShareActionHeight] = useState(0);
  const contentStyle = useMemo(
    () => [
      styles.content,
      tabInsets,
      {
        paddingBottom:
          (('paddingBottom' in tabInsets ? tabInsets.paddingBottom : undefined) ??
            tokens.spacing['3xl']) + shareActionHeight,
      },
    ],
    [shareActionHeight, tabInsets],
  );
  const openPost = useCallback(
    (id: string) => push({ pathname: '/forum/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const share = useCallback(() => push(shareActions[segment].route), [push, segment]);
  const segmentOptions = useMemo<readonly SegmentedControlOption<CommunitySegment>[]>(() => {
    const newCountLabel = (label: string, count: number) =>
      count > 0 ? t('common:newCount', { label, count }) : undefined;
    const forumLabel = t('forum:segmentForum');
    const galleryLabel = t('forum:segmentGallery');
    const storiesLabel = t('forum:segmentStories');
    return [
      {
        key: 'forum',
        label: forumLabel,
        symbol: 'chats',
        testID: 'community-segment-forum',
        count: segmentCounts.forum,
        accessibilityLabel: newCountLabel(forumLabel, segmentCounts.forum),
      },
      {
        key: 'gallery',
        label: galleryLabel,
        symbol: 'gallery',
        testID: 'community-segment-gallery',
        count: segmentCounts.gallery,
        accessibilityLabel: newCountLabel(galleryLabel, segmentCounts.gallery),
      },
      {
        key: 'stories',
        label: storiesLabel,
        symbol: 'book',
        testID: 'community-segment-stories',
        count: segmentCounts.stories,
        accessibilityLabel: newCountLabel(storiesLabel, segmentCounts.stories),
      },
    ];
  }, [segmentCounts, t]);
  const openLinkLabel = useCallback((url: string) => t('forum:openLink', { url }), [t]);
  const refresh = useCallback(() => {
    void Promise.all([refetchCategories(), refetchPosts(), refetchTabNews()]);
  }, [refetchCategories, refetchPosts, refetchTabNews]);
  const renderPost = useCallback(
    ({ item, index }: ListRenderItemInfo<ForumPostRow>) => {
      const news = forumPostNews(forumVisit, item.id);
      const unseenLabel = news.isNew ? t('home:unseen') : null;
      // The card adds pinned and the reply count; the word goes first (RAPP-873).
      const accessibilityLabel = [
        unseenLabel,
        t('forum:openPost', { name: item.author_first_name }),
        news.newReplies > 0 ? t('forum:newReplies', { count: news.newReplies }) : null,
      ]
        .filter((part): part is string => part !== null)
        .join('. ');
      return (
        <PageWidth className="pb-md">
          <FadeSlideIn index={index}>
            <ForumPostCard
              post={item}
              tone={toneByCategoryId[item.category_id]}
              authorLabel={t('forum:postBy', { name: item.author_first_name })}
              authorAvatarKey={personCards.get(item.author_id)?.avatarKey ?? null}
              repliesLabel={t('forum:repliesCount', { count: item.reply_count })}
              pinnedLabel={t('forum:pinned')}
              imageAlt={t('forum:imageAlt', { name: item.author_first_name })}
              accessibilityLabel={accessibilityLabel}
              languageFontClass={languageFontClass}
              accessToken={session?.access_token}
              openLinkLabel={openLinkLabel}
              onOpen={openPost}
              unseenLabel={unseenLabel}
              newRepliesCount={formatUnreadBadge(news.newReplies)}
            />
          </FadeSlideIn>
        </PageWidth>
      );
    },
    [
      forumVisit,
      languageFontClass,
      openLinkLabel,
      openPost,
      session?.access_token,
      personCards,
      t,
      toneByCategoryId,
    ],
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
        <PlayerTabHeader title={t('nav:tabs.community')} />
        <SegmentedControl
          testID="community-segments"
          options={segmentOptions}
          selected={segment}
          onSelect={setSegment}
          accessibilityLabel={t('forum:segmentsLabel')}
          languageFontClass={languageFontClass}
        />
        {segment === 'forum' ? (
          <ForumCategoryFilters
            categories={categoriesQuery.data ?? EMPTY_CATEGORIES}
            selectedId={categoryId}
            allLabel={t('forum:allCategories')}
            accessibilityLabel={t('forum:categoriesLabel')}
            onSelect={setCategoryId}
          />
        ) : null}
      </PageWidth>
    </View>
  );

  let segmentList: ReactElement;
  if (segment === 'gallery') {
    segmentList = (
      <GalleryGrid
        header={header}
        contentContainerStyle={contentStyle}
        newItemIds={galleryNewItemIds}
      />
    );
  } else if (segment === 'stories') {
    segmentList = (
      <CommunityStoryList
        header={header}
        contentContainerStyle={contentStyle}
        newArticleIds={storiesNewArticleIds}
      />
    );
  } else {
    segmentList = (
      <FlashList
        testID="forum-board"
        data={posts}
        renderItem={renderPost}
        keyExtractor={postKeyExtractor}
        extraData={forumVisit}
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
      <TabScreenAction testID="community-share-action" onContentHeight={setShareActionHeight}>
        <AuthSubmitButton
          testID="community-share"
          label={t(shareActions[segment].labelKey)}
          icon="plus"
          // A forum post needs the network; the sheet used to grey it out the same way.
          disabled={segment === 'forum' && isOffline}
          onPress={share}
        />
      </TabScreenAction>
    </>
  );
}
