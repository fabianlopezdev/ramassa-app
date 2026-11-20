import { forumNewsCount, type TabNews } from '@ramassa/shared/tab-news';

export interface CommunitySegmentCounts {
  readonly forum: number;
  readonly gallery: number;
  readonly stories: number;
}

const NO_COMMUNITY_SEGMENT_COUNTS: CommunitySegmentCounts = { forum: 0, gallery: 0, stories: 0 };

/**
 * The numbers on Comunitat's switch (RAPP-873), from the live news, so they
 * add up to the number on the tab. Zero until the news has loaded.
 */
export function communitySegmentCounts(news: TabNews | undefined): CommunitySegmentCounts {
  if (news === undefined) return NO_COMMUNITY_SEGMENT_COUNTS;
  return {
    forum: forumNewsCount(news),
    gallery: news.gallery.unseenItemIds.length,
    stories: news.stories.unseenArticleIds.length,
  };
}

export interface ForumPostNews {
  readonly isNew: boolean;
  readonly newReplies: number;
}

/**
 * The marks one forum card carries (RAPP-873): the word while she has not
 * opened the post, and the number of replies she has not read on her own post.
 */
export function forumPostNews(snapshot: TabNews['forum'], postId: string): ForumPostNews {
  return {
    isNew: snapshot.unopenedPostIds.includes(postId),
    newReplies: snapshot.newRepliesByPostId[postId] ?? 0,
  };
}

/** The shared empty set, so a list with nothing new keeps one stable value. */
export const NO_NEW_IDS: ReadonlySet<string> = new Set();

/** A list's unopened ids as a set, for a quick look up on every card (RAPP-873). */
export function toNewIdSet(ids: readonly string[]): ReadonlySet<string> {
  return ids.length === 0 ? NO_NEW_IDS : new Set(ids);
}
