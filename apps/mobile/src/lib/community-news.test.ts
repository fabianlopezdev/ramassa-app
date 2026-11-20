import { describe, expect, test } from 'bun:test';
import { EMPTY_TAB_NEWS, type TabNews } from '@ramassa/shared/tab-news';
import {
  communityUnseenCounts,
  forumPostMarks,
  NO_UNOPENED_IDS,
  toUnopenedIdSet,
} from './community-news';

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

describe('community unseen counts (RAPP-873)', () => {
  test('are zero while the news has not loaded', () => {
    expect(communityUnseenCounts(undefined)).toEqual({ forum: 0, gallery: 0, stories: 0 });
  });

  test('count unseen posts plus new replies, unseen photos and unseen stories', () => {
    expect(communityUnseenCounts(news)).toEqual({ forum: 5, gallery: 1, stories: 4 });
  });

  test('keep the new replies on her post once she has seen the forum list', () => {
    const listSeen: TabNews = { ...news, forum: { ...news.forum, unseenPostIds: [] } };
    expect(communityUnseenCounts(listSeen).forum).toBe(3);
  });

  test('ignore what she has seen in the list and not yet opened', () => {
    const listsSeen: TabNews = {
      ...news,
      gallery: { ...news.gallery, unseenItemIds: [] },
      stories: { ...news.stories, unseenArticleIds: [] },
    };
    expect(communityUnseenCounts(listsSeen)).toEqual({ forum: 5, gallery: 0, stories: 0 });
  });
});

describe('forum post marks (RAPP-873)', () => {
  const unopenedPostIds = toUnopenedIdSet(news.forum.unopenedPostIds);
  const marks = (postId: string) =>
    forumPostMarks(unopenedPostIds, news.forum.newRepliesByPostId, postId);

  test('an unopened post is new and has no new replies of its own', () => {
    expect(marks('post-a')).toEqual({ isUnopened: true, newReplies: 0 });
  });

  test('a post she saw in the list and has not opened is still new', () => {
    expect(marks('post-d')).toEqual({ isUnopened: true, newReplies: 0 });
  });

  test('her post with replies she has not read carries their number', () => {
    expect(marks('post-c')).toEqual({ isUnopened: false, newReplies: 3 });
  });

  test('a post she has opened carries nothing', () => {
    expect(marks('post-z')).toEqual({ isUnopened: false, newReplies: 0 });
    expect(forumPostMarks(NO_UNOPENED_IDS, {}, 'post-a')).toEqual({
      isUnopened: false,
      newReplies: 0,
    });
  });
});

describe('unopened id set (RAPP-873)', () => {
  test('holds the unopened ids for a quick look up per card', () => {
    const ids = toUnopenedIdSet(news.gallery.unopenedItemIds);
    expect(ids.has('item-b')).toBe(true);
    expect(ids.has('item-c')).toBe(false);
  });

  test('is the shared empty set when nothing is unopened', () => {
    expect(toUnopenedIdSet([])).toBe(NO_UNOPENED_IDS);
    expect(NO_UNOPENED_IDS.size).toBe(0);
  });
});
