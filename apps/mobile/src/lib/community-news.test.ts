import { describe, expect, test } from 'bun:test';
import { EMPTY_TAB_NEWS, type TabNews } from '@ramassa/shared/tab-news';
import { communitySegmentCounts, forumPostNews, NO_NEW_IDS, toNewIdSet } from './community-news';

const news: TabNews = {
  ...EMPTY_TAB_NEWS,
  forum: { newPostIds: ['post-a', 'post-b'], newRepliesByPostId: { 'post-c': 3 } },
  gallery: { newItemIds: ['item-a'] },
  stories: { newArticleIds: ['story-a', 'story-b', 'story-c', 'story-d'] },
};

describe('community segment counts (RAPP-873)', () => {
  test('are zero while the news has not loaded', () => {
    expect(communitySegmentCounts(undefined)).toEqual({ forum: 0, gallery: 0, stories: 0 });
  });

  test('count new posts plus new replies, new photos and new stories', () => {
    expect(communitySegmentCounts(news)).toEqual({ forum: 5, gallery: 1, stories: 4 });
  });
});

describe('forum post news (RAPP-873)', () => {
  test('a post in the snapshot is new and has no new replies of its own', () => {
    expect(forumPostNews(news.forum, 'post-a')).toEqual({ isNew: true, newReplies: 0 });
  });

  test('her post with replies she has not read carries their number', () => {
    expect(forumPostNews(news.forum, 'post-c')).toEqual({ isNew: false, newReplies: 3 });
  });

  test('a post outside the snapshot carries nothing', () => {
    expect(forumPostNews(news.forum, 'post-z')).toEqual({ isNew: false, newReplies: 0 });
    expect(forumPostNews(EMPTY_TAB_NEWS.forum, 'post-a')).toEqual({
      isNew: false,
      newReplies: 0,
    });
  });
});

describe('new id set (RAPP-873)', () => {
  test('holds the ids of a snapshot for a quick look up per card', () => {
    const ids = toNewIdSet(news.gallery.newItemIds);
    expect(ids.has('item-a')).toBe(true);
    expect(ids.has('item-b')).toBe(false);
  });

  test('is the shared empty set when nothing is new', () => {
    expect(toNewIdSet([])).toBe(NO_NEW_IDS);
    expect(NO_NEW_IDS.size).toBe(0);
  });
});
