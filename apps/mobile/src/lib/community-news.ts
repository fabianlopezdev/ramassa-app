import { forumNewsCount, type TabNews } from '@ramassa/shared/tab-news';

export interface CommunityUnseenCounts {
  readonly forum: number;
  readonly gallery: number;
  readonly stories: number;
}

const NO_COMMUNITY_UNSEEN_COUNTS: CommunityUnseenCounts = { forum: 0, gallery: 0, stories: 0 };

/**
 * The numbers on Comunitat's switch (RAPP-873), from the live news, so they
 * add up to the number on the tab. A post, photo or story counts until she has
 * seen the list that shows it; the new replies on her own post count until she
 * opens that post. Zero until the news has loaded.
 */
export function communityUnseenCounts(news: TabNews | undefined): CommunityUnseenCounts {
  if (news === undefined) return NO_COMMUNITY_UNSEEN_COUNTS;
  return {
    forum: forumNewsCount(news),
    gallery: news.gallery.unseenItemIds.length,
    stories: news.stories.unseenArticleIds.length,
  };
}

export interface ForumPostMarks {
  readonly isUnopened: boolean;
  readonly newReplies: number;
}

/**
 * The marks one forum card carries (RAPP-873): "Nou" while she has not opened
 * a post by another player, and the replies she has not read on her own post.
 * Both stay until she opens the post.
 */
export function forumPostMarks(
  unopenedPostIds: ReadonlySet<string>,
  newRepliesByPostId: TabNews['forum']['newRepliesByPostId'],
  postId: string,
): ForumPostMarks {
  return {
    isUnopened: unopenedPostIds.has(postId),
    newReplies: newRepliesByPostId[postId] ?? 0,
  };
}

/** The shared empty set, so a list with nothing unopened keeps one stable value. */
export const NO_UNOPENED_IDS: ReadonlySet<string> = new Set();

/** A list's unopened ids as a set, for a quick look up on every card (RAPP-873). */
export function toUnopenedIdSet(ids: readonly string[]): ReadonlySet<string> {
  return ids.length === 0 ? NO_UNOPENED_IDS : new Set(ids);
}
