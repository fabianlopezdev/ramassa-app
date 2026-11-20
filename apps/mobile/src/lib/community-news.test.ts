import { describe, expect, test } from 'bun:test';
import { EMPTY_TAB_NEWS, type TabNews } from '@ramassa/shared/tab-news';
import { communitySegmentCounts, forumPostNews, NO_NEW_IDS, toNewIdSet } from './community-news';

const news: TabNews = {
  ...EMPTY_TAB_NEWS,
  forum: {
    unseenPostIds: ['post-a', 'post-b'],
    unopenedPostIds: ['post-a', 'post-b', 'post-d'],
    newRepliesByPostId: { 'post-c': 3 },
  },
  gallery: { unseenItemIds: ['item-a'], unopenedItemIds: ['item-a', 'item-b'] },
  stories: {
    unseenArticleIds: ['story-a', 'story-b', 'story-c', 'story-d'],
    unopenedArticleIds: ['story-a', 'story-b', 'story-c', 'story-d'],
  },
};

describe('community segment counts (RAPP-873)', () => {
  test('are zero while the news has not loaded', () => {
    expect(communitySegmentCounts(undefined)).toEqual({ forum: 0, gallery: 0, stories: 0 });
  });

  test('count unseen posts plus new replies, unseen photos and unseen stories', () => {
    expect(communitySegmentCounts(news)).toEqual({ forum: 5, gallery: 1, stories: 4 });
  });
});

describe('forum post news (RAPP-873)', () => {
  test('an unopened post is new and has no new replies of its own', () => {
    expect(forumPostNews(news.forum, 'post-a')).toEqual({ isNew: true, newReplies: 0 });
  });

  test('a post she saw in the list and has not opened is still new', () => {
    expect(forumPostNews(news.forum, 'post-d')).toEqual({ isNew: true, newReplies: 0 });
  });

  test('her post with replies she has not read carries their number', () => {
    expect(forumPostNews(news.forum, 'post-c')).toEqual({ isNew: false, newReplies: 3 });
  });

  test('a post she has opened carries nothing', () => {
    expect(forumPostNews(news.forum, 'post-z')).toEqual({ isNew: false, newReplies: 0 });
    expect(forumPostNews(EMPTY_TAB_NEWS.forum, 'post-a')).toEqual({
      isNew: false,
      newReplies: 0,
    });
  });
});

describe('new id set (RAPP-873)', () => {
  test('holds the unopened ids for a quick look up per card', () => {
    const ids = toNewIdSet(news.gallery.unopenedItemIds);
    expect(ids.has('item-b')).toBe(true);
    expect(ids.has('item-c')).toBe(false);
  });

  test('is the shared empty set when nothing is new', () => {
    expect(toNewIdSet([])).toBe(NO_NEW_IDS);
    expect(NO_NEW_IDS.size).toBe(0);
  });
});
