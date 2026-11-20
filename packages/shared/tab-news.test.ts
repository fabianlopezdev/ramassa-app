import { describe, expect, test } from 'bun:test';
import {
  communityNewsCount,
  contactNewsCount,
  EMPTY_TAB_NEWS,
  fetchTabNews,
  forumNewsCount,
  helpNewsCount,
  isTabItemNew,
  NO_TAB_ITEMS_SEEN,
  withTabItemsSeen,
  type TabNews,
} from './tab-news';

const POST_A = '00000000-0000-4000-8000-00000000000a';
const POST_B = '00000000-0000-4000-8000-00000000000b';
const MY_POST = '00000000-0000-4000-8000-00000000000c';
const ITEM = '00000000-0000-4000-8000-0000000000d1';
const STORY = '00000000-0000-4000-8000-0000000000e1';
const GUIDE_A = '00000000-0000-4000-8000-0000000000f1';
const GUIDE_B = '00000000-0000-4000-8000-0000000000f2';
const SERVICE_A = '00000000-0000-4000-8000-0000000000a1';
const SERVICE_B = '00000000-0000-4000-8000-0000000000a2';
const CATEGORY = '00000000-0000-4000-8000-0000000000c1';
const REQUEST = '00000000-0000-4000-8000-0000000000b1';
const SUBMISSION = '00000000-0000-4000-8000-0000000000b2';

const news: TabNews = {
  since: '2026-11-20T10:00:00+00:00',
  forum: { newPostIds: [POST_A, POST_B], newRepliesByPostId: { [MY_POST]: 3 } },
  gallery: { newItemIds: [ITEM] },
  stories: { newArticleIds: [STORY] },
  guides: {
    newArticles: [
      { id: GUIDE_A, categoryId: CATEGORY },
      { id: GUIDE_B, categoryId: null },
    ],
  },
  services: {
    newServices: [
      { id: SERVICE_A, categoryId: CATEGORY },
      { id: SERVICE_B, categoryId: CATEGORY },
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
  });

  test('the forum counts new posts and every new reply', () => {
    expect(forumNewsCount(news)).toBe(5);
  });

  test('Comunitat counts the forum, the gallery and the stories', () => {
    expect(communityNewsCount(news)).toBe(7);
  });

  test('Ajuda counts guides and services', () => {
    expect(helpNewsCount(news)).toBe(4);
  });

  test('Contacte counts mentoring and suggestions', () => {
    expect(contactNewsCount(news)).toBe(2);
  });
});

describe('withTabItemsSeen (RAPP-873)', () => {
  test('removes exactly the given ids from every list', () => {
    const next = withTabItemsSeen(news, {
      ...NO_TAB_ITEMS_SEEN,
      forumPostIds: [POST_A],
      mediaItemIds: [ITEM],
      articleIds: [STORY, GUIDE_B],
      serviceIds: [SERVICE_A],
      mentoringRequestIds: [REQUEST],
      feedbackSubmissionIds: [SUBMISSION],
    });
    expect(next.forum).toEqual({ newPostIds: [POST_B], newRepliesByPostId: { [MY_POST]: 3 } });
    expect(next.gallery.newItemIds).toEqual([]);
    expect(next.stories.newArticleIds).toEqual([]);
    expect(next.guides.newArticles).toEqual([{ id: GUIDE_A, categoryId: CATEGORY }]);
    expect(next.services.newServices).toEqual([{ id: SERVICE_B, categoryId: CATEGORY }]);
    expect(next.mentoring.changedRequestIds).toEqual([]);
    expect(next.feedback.changedSubmissionIds).toEqual([]);
    expect(next.since).toBe(news.since);
  });

  test('opening her post removes the count of its new replies', () => {
    const next = withTabItemsSeen(news, { ...NO_TAB_ITEMS_SEEN, forumPostIds: [MY_POST] });
    expect(next.forum).toEqual({ newPostIds: [POST_A, POST_B], newRepliesByPostId: {} });
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
  test('a new item of any kind is new', () => {
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
        forum: { new_post_ids: [POST_A], new_replies: [{ post_id: MY_POST, count: 2 }] },
        gallery: { new_item_ids: [ITEM] },
        stories: { new_article_ids: [STORY] },
        guides: { new_articles: [{ id: GUIDE_A, category_id: null }] },
        services: { new_services: [{ id: SERVICE_A, category_id: CATEGORY }] },
        mentoring: { changed_request_ids: [REQUEST] },
        feedback: { changed_submission_ids: [SUBMISSION] },
      }),
    );
    expect(result).toEqual({
      since: '2026-11-20T10:00:00+00:00',
      forum: { newPostIds: [POST_A], newRepliesByPostId: { [MY_POST]: 2 } },
      gallery: { newItemIds: [ITEM] },
      stories: { newArticleIds: [STORY] },
      guides: { newArticles: [{ id: GUIDE_A, categoryId: null }] },
      services: { newServices: [{ id: SERVICE_A, categoryId: CATEGORY }] },
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
