import { describe, expect, test } from 'bun:test';
import {
  communityNewsCount,
  contactNewsCount,
  EMPTY_TAB_NEWS,
  fetchTabNews,
  forumNewsCount,
  guidesListKey,
  hasUnseenInList,
  helpNewsCount,
  isTabItemNew,
  NO_TAB_ITEMS_SEEN,
  servicesListKey,
  withListsSeen,
  withTabItemsSeen,
  type TabNews,
} from './tab-news';

const POST_A = '00000000-0000-4000-8000-00000000000a';
const POST_B = '00000000-0000-4000-8000-00000000000b';
const POST_OLD = '00000000-0000-4000-8000-00000000000d';
const MY_POST = '00000000-0000-4000-8000-00000000000c';
const ITEM = '00000000-0000-4000-8000-0000000000d1';
const STORY = '00000000-0000-4000-8000-0000000000e1';
const GUIDE_A = '00000000-0000-4000-8000-0000000000f1';
const GUIDE_B = '00000000-0000-4000-8000-0000000000f2';
const SERVICE_A = '00000000-0000-4000-8000-0000000000a1';
const SERVICE_B = '00000000-0000-4000-8000-0000000000a2';
const CATEGORY = '00000000-0000-4000-8000-0000000000c1';
const OTHER_CATEGORY = '00000000-0000-4000-8000-0000000000c2';
const REQUEST = '00000000-0000-4000-8000-0000000000b1';
const SUBMISSION = '00000000-0000-4000-8000-0000000000b2';
const NOW = '2026-11-20T12:00:00.000Z';

// Every unseen thing is also unopened. POST_OLD is unopened only: she saw the
// forum after it was posted and has not opened it yet.
const news: TabNews = {
  since: '2026-11-20T10:00:00+00:00',
  listSeenAt: {},
  forum: {
    unseenPostIds: [POST_A, POST_B],
    unopenedPostIds: [POST_A, POST_B, POST_OLD],
    newRepliesByPostId: { [MY_POST]: 3 },
  },
  gallery: { unseenItemIds: [ITEM], unopenedItemIds: [ITEM] },
  stories: { unseenArticleIds: [STORY], unopenedArticleIds: [STORY] },
  guides: {
    unseenArticles: [
      { id: GUIDE_A, categoryId: CATEGORY },
      { id: GUIDE_B, categoryId: OTHER_CATEGORY },
    ],
    unopenedArticles: [
      { id: GUIDE_A, categoryId: CATEGORY },
      { id: GUIDE_B, categoryId: OTHER_CATEGORY },
    ],
  },
  services: {
    unseenServices: [
      { id: SERVICE_A, categoryId: CATEGORY },
      { id: SERVICE_B, categoryId: OTHER_CATEGORY },
    ],
    unopenedServices: [
      { id: SERVICE_A, categoryId: CATEGORY },
      { id: SERVICE_B, categoryId: OTHER_CATEGORY },
    ],
  },
  mentoring: { changedRequestIds: [REQUEST] },
  feedback: { changedSubmissionIds: [SUBMISSION] },
};

function clientAnswering(data: unknown, error: { message: string } | null = null) {
  const answer = Promise.resolve({ data, error });
  return {
    rpc: () => Object.assign(answer, { abortSignal: () => answer }),
  } as never;
}

describe('tab news counts (RAPP-873)', () => {
  test('nothing is new on the empty news', () => {
    expect(forumNewsCount(EMPTY_TAB_NEWS)).toBe(0);
    expect(communityNewsCount(EMPTY_TAB_NEWS)).toBe(0);
    expect(helpNewsCount(EMPTY_TAB_NEWS)).toBe(0);
    expect(contactNewsCount(EMPTY_TAB_NEWS)).toBe(0);
    expect(EMPTY_TAB_NEWS.since).toBe(new Date(0).toISOString());
    expect(EMPTY_TAB_NEWS.listSeenAt).toEqual({});
  });

  test('the forum counts unseen posts and every new reply', () => {
    expect(forumNewsCount(news)).toBe(5);
  });

  test('Comunitat counts the forum and the unseen gallery items and stories', () => {
    expect(communityNewsCount(news)).toBe(7);
  });

  test('Ajuda counts unseen guides and services', () => {
    expect(helpNewsCount(news)).toBe(4);
  });

  test('Contacte counts mentoring and suggestions', () => {
    expect(contactNewsCount(news)).toBe(2);
  });

  test('a thing she has seen in its list and not opened raises no number', () => {
    const seen = withListsSeen(news, ['forum'], NOW);
    expect(forumNewsCount(seen)).toBe(3);
    expect(seen.forum.unopenedPostIds).toEqual(news.forum.unopenedPostIds);
  });
});

describe('list keys (RAPP-873)', () => {
  test('a list of services or guides is named by its category', () => {
    expect(servicesListKey(CATEGORY)).toBe(`services:${CATEGORY}`);
    expect(guidesListKey(CATEGORY)).toBe(`guides:${CATEGORY}`);
  });
});

describe('withListsSeen (RAPP-873)', () => {
  test('seeing the forum empties its unseen posts and keeps the rest', () => {
    const next = withListsSeen(news, ['forum'], NOW);
    expect(next.forum).toEqual({
      unseenPostIds: [],
      unopenedPostIds: [POST_A, POST_B, POST_OLD],
      newRepliesByPostId: { [MY_POST]: 3 },
    });
    expect(next.gallery).toBe(news.gallery);
    expect(next.listSeenAt).toEqual({ forum: NOW });
  });

  test('seeing the gallery and the stories empties only what they show', () => {
    const next = withListsSeen(news, ['gallery', 'stories'], NOW);
    expect(next.gallery).toEqual({ unseenItemIds: [], unopenedItemIds: [ITEM] });
    expect(next.stories).toEqual({ unseenArticleIds: [], unopenedArticleIds: [STORY] });
    expect(next.forum).toBe(news.forum);
  });

  test('seeing one category of services or guides empties that category only', () => {
    const next = withListsSeen(
      news,
      [servicesListKey(CATEGORY), guidesListKey(OTHER_CATEGORY)],
      NOW,
    );
    expect(next.services.unseenServices).toEqual([{ id: SERVICE_B, categoryId: OTHER_CATEGORY }]);
    expect(next.services.unopenedServices).toEqual(news.services.unopenedServices);
    expect(next.guides.unseenArticles).toEqual([{ id: GUIDE_A, categoryId: CATEGORY }]);
    expect(next.guides.unopenedArticles).toEqual(news.guides.unopenedArticles);
  });

  test('activities and Inici are only recorded', () => {
    const next = withListsSeen(news, ['activities', 'home'], NOW);
    expect(next.listSeenAt).toEqual({ activities: NOW, home: NOW });
    expect(communityNewsCount(next)).toBe(7);
    expect(helpNewsCount(next)).toBe(4);
  });

  test('her replies, her mentoring and her suggestions stay', () => {
    const next = withListsSeen(news, ['forum', 'gallery', 'stories'], NOW);
    expect(next.forum.newRepliesByPostId).toEqual({ [MY_POST]: 3 });
    expect(next.mentoring).toBe(news.mentoring);
    expect(next.feedback).toBe(news.feedback);
  });
});

describe('hasUnseenInList (RAPP-873)', () => {
  test('a list with unseen things says so', () => {
    expect(hasUnseenInList(news, 'forum')).toBe(true);
    expect(hasUnseenInList(news, 'gallery')).toBe(true);
    expect(hasUnseenInList(news, 'stories')).toBe(true);
    expect(hasUnseenInList(news, servicesListKey(CATEGORY))).toBe(true);
    expect(hasUnseenInList(news, guidesListKey(OTHER_CATEGORY))).toBe(true);
  });

  test('a seen list, an empty category, activities and Inici have nothing unseen', () => {
    expect(hasUnseenInList(withListsSeen(news, ['forum'], NOW), 'forum')).toBe(false);
    expect(hasUnseenInList(news, servicesListKey(GUIDE_A))).toBe(false);
    expect(hasUnseenInList(news, 'activities')).toBe(false);
    expect(hasUnseenInList(news, 'home')).toBe(false);
  });
});

describe('withTabItemsSeen (RAPP-873)', () => {
  test('removes exactly the given ids from the unseen and the unopened lists', () => {
    const next = withTabItemsSeen(news, {
      ...NO_TAB_ITEMS_SEEN,
      forumPostIds: [POST_A],
      mediaItemIds: [ITEM],
      articleIds: [STORY, GUIDE_B],
      serviceIds: [SERVICE_A],
      mentoringRequestIds: [REQUEST],
      feedbackSubmissionIds: [SUBMISSION],
    });
    expect(next.forum).toEqual({
      unseenPostIds: [POST_B],
      unopenedPostIds: [POST_B, POST_OLD],
      newRepliesByPostId: { [MY_POST]: 3 },
    });
    expect(next.gallery).toEqual({ unseenItemIds: [], unopenedItemIds: [] });
    expect(next.stories).toEqual({ unseenArticleIds: [], unopenedArticleIds: [] });
    expect(next.guides.unseenArticles).toEqual([{ id: GUIDE_A, categoryId: CATEGORY }]);
    expect(next.guides.unopenedArticles).toEqual([{ id: GUIDE_A, categoryId: CATEGORY }]);
    expect(next.services.unseenServices).toEqual([{ id: SERVICE_B, categoryId: OTHER_CATEGORY }]);
    expect(next.services.unopenedServices).toEqual([{ id: SERVICE_B, categoryId: OTHER_CATEGORY }]);
    expect(next.mentoring.changedRequestIds).toEqual([]);
    expect(next.feedback.changedSubmissionIds).toEqual([]);
    expect(next.since).toBe(news.since);
    expect(next.listSeenAt).toBe(news.listSeenAt);
  });

  test('opening her post removes the count of its new replies', () => {
    const next = withTabItemsSeen(news, { ...NO_TAB_ITEMS_SEEN, forumPostIds: [MY_POST] });
    expect(next.forum.newRepliesByPostId).toEqual({});
    expect(forumNewsCount(next)).toBe(2);
  });

  test('nothing given changes nothing', () => {
    expect(withTabItemsSeen(news, NO_TAB_ITEMS_SEEN)).toEqual(news);
  });

  test('ids that are not new change nothing', () => {
    const next = withTabItemsSeen(news, { ...NO_TAB_ITEMS_SEEN, serviceIds: [POST_A] });
    expect(helpNewsCount(next)).toBe(4);
  });
});

describe('isTabItemNew (RAPP-873)', () => {
  test('an unopened thing of any kind is new', () => {
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, forumPostIds: [POST_B] })).toBe(true);
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, mediaItemIds: [ITEM] })).toBe(true);
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, articleIds: [STORY] })).toBe(true);
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, articleIds: [GUIDE_A] })).toBe(true);
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, serviceIds: [SERVICE_B] })).toBe(true);
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, mentoringRequestIds: [REQUEST] })).toBe(true);
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, feedbackSubmissionIds: [SUBMISSION] })).toBe(
      true,
    );
  });

  test('a post seen in its list and not opened is still new', () => {
    const seen = withListsSeen(news, ['forum'], NOW);
    expect(isTabItemNew(seen, { ...NO_TAB_ITEMS_SEEN, forumPostIds: [POST_OLD] })).toBe(true);
  });

  test('her post with new replies is new', () => {
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, forumPostIds: [MY_POST] })).toBe(true);
  });

  test('an id in the wrong list or in no list is not new', () => {
    expect(isTabItemNew(news, { ...NO_TAB_ITEMS_SEEN, serviceIds: [POST_A] })).toBe(false);
    expect(isTabItemNew(news, NO_TAB_ITEMS_SEEN)).toBe(false);
    expect(isTabItemNew(EMPTY_TAB_NEWS, { ...NO_TAB_ITEMS_SEEN, forumPostIds: [MY_POST] })).toBe(
      false,
    );
  });
});

describe('fetchTabNews (RAPP-873)', () => {
  test('turns the database answer into the news', async () => {
    const result = await fetchTabNews(
      clientAnswering({
        since: '2026-11-20T10:00:00+00:00',
        list_seen_at: { forum: '2026-11-20T11:00:00.123456+00:00' },
        forum: {
          unseen_post_ids: [POST_A],
          unopened_post_ids: [POST_A, POST_OLD],
          new_replies: [{ post_id: MY_POST, count: 2 }],
        },
        gallery: { unseen_item_ids: [ITEM], unopened_item_ids: [ITEM] },
        stories: { unseen_article_ids: [], unopened_article_ids: [STORY] },
        guides: {
          unseen_articles: [{ id: GUIDE_A, category_id: null }],
          unopened_articles: [{ id: GUIDE_A, category_id: null }],
        },
        services: {
          unseen_services: [],
          unopened_services: [{ id: SERVICE_A, category_id: CATEGORY }],
        },
        mentoring: { changed_request_ids: [REQUEST] },
        feedback: { changed_submission_ids: [SUBMISSION] },
      }),
    );
    expect(result).toEqual({
      since: '2026-11-20T10:00:00+00:00',
      listSeenAt: { forum: '2026-11-20T11:00:00.123456+00:00' },
      forum: {
        unseenPostIds: [POST_A],
        unopenedPostIds: [POST_A, POST_OLD],
        newRepliesByPostId: { [MY_POST]: 2 },
      },
      gallery: { unseenItemIds: [ITEM], unopenedItemIds: [ITEM] },
      stories: { unseenArticleIds: [], unopenedArticleIds: [STORY] },
      guides: {
        unseenArticles: [{ id: GUIDE_A, categoryId: null }],
        unopenedArticles: [{ id: GUIDE_A, categoryId: null }],
      },
      services: {
        unseenServices: [],
        unopenedServices: [{ id: SERVICE_A, categoryId: CATEGORY }],
      },
      mentoring: { changedRequestIds: [REQUEST] },
      feedback: { changedSubmissionIds: [SUBMISSION] },
    });
  });

  test('an unexpected answer is a database error', async () => {
    await expect(fetchTabNews(clientAnswering({ since: 'yesterday' }))).rejects.toMatchObject({
      code: 'DB-1',
    });
  });

  test('a failed call is a database error', async () => {
    await expect(fetchTabNews(clientAnswering(null, { message: 'boom' }))).rejects.toMatchObject({
      code: 'DB-1',
    });
  });
});
