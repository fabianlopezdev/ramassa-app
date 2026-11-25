import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { ForumCategoryFilters } from '@/components/forum/forum-category-tabs';
import { ForumPostCard } from '@/components/forum/forum-post-card';
import { useGalleryList } from '@/components/gallery/gallery-grid';
import { useCommunityStoryList } from '@/components/knowledge/community-story-list';
import { OwnStoryStatuses } from '@/components/knowledge/own-story-statuses';
import { PageWidth } from '@/components/layout/content-width';
import { raisedToneFromColorName, type RaisedTone } from '@/components/layout/raised-surface';
import { screenBlockGapClassName } from '@/components/layout/screen-spacing';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/layout/segmented-control';
import { TabScreenAction } from '@/components/layout/tab-screen-action';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { PlayerTabHeader } from '@/components/profile/player-tab-header';
import { communityUnseenCounts, forumPostMarks, toUnopenedIdSet } from '@/lib/community-news';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePersonCards } from '@/lib/person-cards';
import { useForumCategories, useForumPosts } from '@/lib/player-forum';
import { repliesCountLabel } from '@/lib/replies-count-label';
import { formatUnreadBadge } from '@/lib/unread-badge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { useListSeen, useTabNews } from '@/lib/use-tab-news';
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
const postItemType = () => 'post';
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

function CommunityScreen() {
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
  // Two levels, both live (RAPP-873). The number on each switch option counts
  // what she has not seen in that list, and seeing the list on show clears it.
  // "Nou" stays on a post, photo or story until she opens it. The new replies
  // on her own post stay in the number and on its card until she opens it.
  const tabNewsQuery = useTabNews();
  const refetchTabNews = tabNewsQuery.refetch;
  const segmentCounts = useMemo(
    () => communityUnseenCounts(tabNewsQuery.data),
    [tabNewsQuery.data],
  );
  // A list counts as seen once its cards are on show: the forum with its posts
  // loaded and every category showing, since a chosen category hides the rest.
  // The gallery and the stories say it themselves, where their lists load.
  useListSeen('forum', segment === 'forum' && categoryId === null && postsQuery.data !== undefined);
  const forumNews = tabNewsQuery.data?.forum ?? EMPTY_TAB_NEWS.forum;
  const galleryNews = tabNewsQuery.data?.gallery ?? EMPTY_TAB_NEWS.gallery;
  const storiesNews = tabNewsQuery.data?.stories ?? EMPTY_TAB_NEWS.stories;
  const unopenedPostIds = useMemo(
    () => toUnopenedIdSet(forumNews.unopenedPostIds),
    [forumNews.unopenedPostIds],
  );
  const newRepliesByPostId = forumNews.newRepliesByPostId;
  const unopenedGalleryItemIds = useMemo(
    () => toUnopenedIdSet(galleryNews.unopenedItemIds),
    [galleryNews.unopenedItemIds],
  );
  const unopenedStoryIds = useMemo(
    () => toUnopenedIdSet(storiesNews.unopenedArticleIds),
    [storiesNews.unopenedArticleIds],
  );
  const forumListMarks = useMemo(
    () => ({ unopenedPostIds, newRepliesByPostId }),
    [newRepliesByPostId, unopenedPostIds],
  );
  // The photos and the stories, as rows for the one list below (RAPP-977).
  const galleryList = useGalleryList({
    isOnShow: segment === 'gallery',
    unopenedItemIds: unopenedGalleryItemIds,
  });
  const storyList = useCommunityStoryList({
    isOnShow: segment === 'stories',
    unopenedArticleIds: unopenedStoryIds,
  });
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
  const formatRepliesCount = useCallback(
    (count: number) => t('forum:repliesCount', { count }),
    [t],
  );
  const refresh = useCallback(() => {
    void Promise.all([refetchCategories(), refetchPosts(), refetchTabNews()]);
  }, [refetchCategories, refetchPosts, refetchTabNews]);
  const renderPost = useCallback(
    ({ item }: ListRenderItemInfo<ForumPostRow>) => {
      const marks = forumPostMarks(unopenedPostIds, newRepliesByPostId, item.id);
      const unseenLabel = marks.isUnopened ? t('home:unseen') : null;
      // The card adds pinned and the reply count; the word goes first (RAPP-873).
      const accessibilityLabel = [
        unseenLabel,
        t('forum:openPost', { name: item.author_first_name }),
        marks.newReplies > 0 ? t('forum:newReplies', { count: marks.newReplies }) : null,
      ]
        .filter((part): part is string => part !== null)
        .join('. ');
      return (
        <PageWidth className="pb-md">
          <ForumPostCard
            post={item}
            tone={toneByCategoryId[item.category_id]}
            authorAvatarKey={personCards.get(item.author_id)?.avatarKey ?? null}
            repliesLabel={repliesCountLabel(item.reply_count, formatRepliesCount)}
            pinnedLabel={t('forum:pinned')}
            imageAlt={t('forum:imageAlt', { name: item.author_first_name })}
            accessibilityLabel={accessibilityLabel}
            languageFontClass={languageFontClass}
            accessToken={session?.access_token}
            openLinkLabel={openLinkLabel}
            href={`/forum/${item.id}` as Href}
            unseenLabel={unseenLabel}
            newRepliesCount={formatUnreadBadge(marks.newReplies)}
          />
        </PageWidth>
      );
    },
    [
      formatRepliesCount,
      languageFontClass,
      newRepliesByPostId,
      openLinkLabel,
      session?.access_token,
      personCards,
      t,
      toneByCategoryId,
      unopenedPostIds,
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

  // One header for every view; forum category chips show only in the Fòrum
  // view, so the screen never stacks two filter rows (plan P4), and her own
  // stories waiting for the team show above the stories (RAPP-890).
  const header = (
    <View>
      <View className="gap-lg pb-lg">
        <PageWidth className={screenBlockGapClassName}>
          <PlayerTabHeader title={t('nav:tabs.community')}>
            <SegmentedControl
              testID="community-segments"
              options={segmentOptions}
              selected={segment}
              onSelect={setSegment}
              accessibilityLabel={t('forum:segmentsLabel')}
              languageFontClass={languageFontClass}
            />
          </PlayerTabHeader>
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
      {segment === 'stories' ? (
        <PageWidth className="pb-lg">
          <OwnStoryStatuses />
        </PageWidth>
      ) : null}
    </View>
  );

  // One list for the three views (RAPP-977). Each branch is the same list in
  // the same place, so React keeps it and its header when the view changes and
  // only the rows change. Her photo, the title and the switch are never built
  // again, which is what made the photo blink on Android.
  let segmentList: ReactElement;
  if (segment === 'gallery') {
    segmentList = (
      <FlashList
        {...galleryList}
        style={styles.screen}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
      />
    );
  } else if (segment === 'stories') {
    segmentList = (
      <FlashList
        {...storyList}
        style={styles.screen}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
      />
    );
  } else {
    segmentList = (
      <FlashList
        testID="forum-board"
        data={posts}
        renderItem={renderPost}
        keyExtractor={postKeyExtractor}
        getItemType={postItemType}
        extraData={forumListMarks}
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

export default withScreenEntrance('community', CommunityScreen);
