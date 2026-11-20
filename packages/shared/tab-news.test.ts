import { describe, expect, test } from 'bun:test';
import {
  communityNewsCount,
  contactNewsCount,
  EMPTY_TAB_NEWS,
  fetchTabNews,
  forumNewsCount,
  helpNewsCount,
  isSameSectionNews,
  isSectionNewsEmpty,
  mergeSectionNews,
  withHelpItemsSeen,
  withSectionVisited,
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

describe('withSectionVisited (RAPP-873)', () => {
  test('opening the forum empties posts and replies and leaves the rest', () => {
    const next = withSectionVisited(news, 'forum');
    expect(next.forum).toEqual({ newPostIds: [], newRepliesByPostId: {} });
    expect(next.gallery).toBe(news.gallery);
    expect(communityNewsCount(next)).toBe(2);
  });

  test('each section empties only itself', () => {
    expect(withSectionVisited(news, 'gallery').gallery.newItemIds).toEqual([]);
    expect(withSectionVisited(news, 'stories').stories.newArticleIds).toEqual([]);
    expect(withSectionVisited(news, 'mentoring').mentoring.changedRequestIds).toEqual([]);
    expect(withSectionVisited(news, 'feedback').feedback.changedSubmissionIds).toEqual([]);
    expect(withSectionVisited(news, 'feedback').mentoring).toBe(news.mentoring);
  });
});

describe('withHelpItemsSeen (RAPP-873)', () => {
  test('removes exactly the given services and guides', () => {
    const next = withHelpItemsSeen(news, { serviceIds: [SERVICE_A], articleIds: [GUIDE_B] });
    expect(next.services.newServices).toEqual([{ id: SERVICE_B, categoryId: CATEGORY }]);
    expect(next.guides.newArticles).toEqual([{ id: GUIDE_A, categoryId: CATEGORY }]);
    expect(next.forum).toBe(news.forum);
  });

  test('ids that are not new change nothing', () => {
    const next = withHelpItemsSeen(news, { serviceIds: [POST_A], articleIds: [] });
    expect(helpNewsCount(next)).toBe(4);
  });
});

describe('mergeSectionNews (RAPP-873)', () => {
  test('nothing new means the slice is empty', () => {
    expect(isSectionNewsEmpty('forum', EMPTY_TAB_NEWS.forum)).toBe(true);
    expect(isSectionNewsEmpty('forum', news.forum)).toBe(false);
    expect(
      isSectionNewsEmpty('forum', { newPostIds: [], newRepliesByPostId: { [MY_POST]: 1 } }),
    ).toBe(false);
    expect(isSectionNewsEmpty('gallery', news.gallery)).toBe(false);
    expect(isSectionNewsEmpty('mentoring', EMPTY_TAB_NEWS.mentoring)).toBe(true);
  });

  test('what arrives during a visit is added in front, without duplicates', () => {
    expect(
      mergeSectionNews('gallery', { newItemIds: [ITEM] }, { newItemIds: [STORY, ITEM] }),
    ).toEqual({ newItemIds: [STORY, ITEM] });
    expect(
      mergeSectionNews('feedback', { changedSubmissionIds: [SUBMISSION] }, EMPTY_TAB_NEWS.feedback),
    ).toEqual({ changedSubmissionIds: [SUBMISSION] });
  });

  test('new replies that arrive during a visit add to the count of their post', () => {
    expect(
      mergeSectionNews(
        'forum',
        { newPostIds: [POST_A], newRepliesByPostId: { [MY_POST]: 2 } },
        { newPostIds: [POST_B], newRepliesByPostId: { [MY_POST]: 1, [POST_A]: 1 } },
      ),
    ).toEqual({
      newPostIds: [POST_B, POST_A],
      newRepliesByPostId: { [MY_POST]: 3, [POST_A]: 1 },
    });
  });

  test('an arriving slice that is empty keeps the slice as it was', () => {
    const earlier = news.stories;
    expect(mergeSectionNews('stories', earlier, EMPTY_TAB_NEWS.stories)).toBe(earlier);
  });
});

describe('isSameSectionNews (RAPP-873)', () => {
  test('equal content in another order is the same', () => {
    expect(
      isSameSectionNews(
        'forum',
        { newPostIds: [POST_A, POST_B], newRepliesByPostId: { [MY_POST]: 2, [POST_A]: 1 } },
        { newPostIds: [POST_B, POST_A], newRepliesByPostId: { [POST_A]: 1, [MY_POST]: 2 } },
      ),
    ).toBe(true);
    expect(
      isSameSectionNews('gallery', { newItemIds: [ITEM, STORY] }, { newItemIds: [STORY, ITEM] }),
    ).toBe(true);
  });

  test('a different reply count is different', () => {
    expect(
      isSameSectionNews(
        'forum',
        { newPostIds: [], newRepliesByPostId: { [MY_POST]: 2 } },
        { newPostIds: [], newRepliesByPostId: { [MY_POST]: 3 } },
      ),
    ).toBe(false);
  });

  test('an extra id is different', () => {
    expect(
      isSameSectionNews('stories', { newArticleIds: [STORY] }, { newArticleIds: [STORY, ITEM] }),
    ).toBe(false);
    expect(
      isSameSectionNews(
        'forum',
        { newPostIds: [POST_A], newRepliesByPostId: {} },
        { newPostIds: [POST_A], newRepliesByPostId: { [MY_POST]: 1 } },
      ),
    ).toBe(false);
  });

  test('two empty slices are the same', () => {
    expect(
      isSameSectionNews('mentoring', EMPTY_TAB_NEWS.mentoring, { changedRequestIds: [] }),
    ).toBe(true);
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
