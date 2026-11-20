/**
 * What is new for her on Comunitat, Ajuda and Contacte (RAPP-873). Every new
 * thing raises a number on one tab only, on two levels:
 *
 * - What is published for everyone (posts, gallery items, stories, guides and
 *   services) is `unseen` until she has seen the list that shows its card, and
 *   the numbers count it. It is `unopened` until she opens it, and the card
 *   says "Nou". A card can say "Nou" with no number on the tab.
 * - What is addressed to her (replies on her post, a staff change to her
 *   mentoring request or to her suggestion) counts and is marked until she
 *   opens that thing.
 *
 * The database works out the lists in `my_tab_news`; the counts and the
 * optimistic updates are pure functions here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { Database } from './types/database';

type Client = SupabaseClient<Database>;

export interface TabNewsItemInCategory {
  readonly id: string;
  readonly categoryId: string | null;
}

/** A list that shows cards: the services or guides of one category have their own key. */
export type TabListKey =
  | 'forum'
  | 'gallery'
  | 'stories'
  | 'activities'
  | 'home'
  | `services:${string}`
  | `guides:${string}`;

export interface TabNews {
  /** What became visible before this moment counts as seen and opened. */
  readonly since: string;
  /** When she last saw each list, by list key. */
  readonly listSeenAt: Readonly<Record<string, string>>;
  readonly forum: {
    readonly unseenPostIds: readonly string[];
    readonly unopenedPostIds: readonly string[];
    readonly newRepliesByPostId: Readonly<Record<string, number>>;
  };
  readonly gallery: {
    readonly unseenItemIds: readonly string[];
    readonly unopenedItemIds: readonly string[];
  };
  readonly stories: {
    readonly unseenArticleIds: readonly string[];
    readonly unopenedArticleIds: readonly string[];
  };
  readonly guides: {
    readonly unseenArticles: readonly TabNewsItemInCategory[];
    readonly unopenedArticles: readonly TabNewsItemInCategory[];
  };
  readonly services: {
    readonly unseenServices: readonly TabNewsItemInCategory[];
    readonly unopenedServices: readonly TabNewsItemInCategory[];
  };
  readonly mentoring: { readonly changedRequestIds: readonly string[] };
  readonly feedback: { readonly changedSubmissionIds: readonly string[] };
}

/** The things she has just opened, by kind. */
export interface TabItemsSeen {
  readonly forumPostIds: readonly string[];
  readonly mediaItemIds: readonly string[];
  /** Guides and stories. */
  readonly articleIds: readonly string[];
  readonly serviceIds: readonly string[];
  readonly mentoringRequestIds: readonly string[];
  readonly feedbackSubmissionIds: readonly string[];
}

export const NO_TAB_ITEMS_SEEN: TabItemsSeen = {
  forumPostIds: [],
  mediaItemIds: [],
  articleIds: [],
  serviceIds: [],
  mentoringRequestIds: [],
  feedbackSubmissionIds: [],
};

export const EMPTY_TAB_NEWS: TabNews = {
  since: new Date(0).toISOString(),
  listSeenAt: {},
  forum: { unseenPostIds: [], unopenedPostIds: [], newRepliesByPostId: {} },
  gallery: { unseenItemIds: [], unopenedItemIds: [] },
  stories: { unseenArticleIds: [], unopenedArticleIds: [] },
  guides: { unseenArticles: [], unopenedArticles: [] },
  services: { unseenServices: [], unopenedServices: [] },
  mentoring: { changedRequestIds: [] },
  feedback: { changedSubmissionIds: [] },
};

export function servicesListKey(categoryId: string): TabListKey {
  return `services:${categoryId}`;
}

export function guidesListKey(categoryId: string): TabListKey {
  return `guides:${categoryId}`;
}

const itemInCategorySchema = z.object({ id: z.uuid(), category_id: z.uuid().nullable() });

const tabNewsResponseSchema = z.object({
  since: z.iso.datetime({ offset: true }),
  list_seen_at: z.record(z.string(), z.iso.datetime({ offset: true })),
  forum: z.object({
    unseen_post_ids: z.array(z.uuid()),
    unopened_post_ids: z.array(z.uuid()),
    new_replies: z.array(z.object({ post_id: z.uuid(), count: z.number().int().positive() })),
  }),
  gallery: z.object({
    unseen_item_ids: z.array(z.uuid()),
    unopened_item_ids: z.array(z.uuid()),
  }),
  stories: z.object({
    unseen_article_ids: z.array(z.uuid()),
    unopened_article_ids: z.array(z.uuid()),
  }),
  guides: z.object({
    unseen_articles: z.array(itemInCategorySchema),
    unopened_articles: z.array(itemInCategorySchema),
  }),
  services: z.object({
    unseen_services: z.array(itemInCategorySchema),
    unopened_services: z.array(itemInCategorySchema),
  }),
  mentoring: z.object({ changed_request_ids: z.array(z.uuid()) }),
  feedback: z.object({ changed_submission_ids: z.array(z.uuid()) }),
});

function toItemInCategory(row: z.infer<typeof itemInCategorySchema>): TabNewsItemInCategory {
  return { id: row.id, categoryId: row.category_id };
}

export async function fetchTabNews(client: Client, signal?: AbortSignal): Promise<TabNews> {
  let query = client.rpc('my_tab_news');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new AppError('DB-1', { message: error.message });
  const parsed = tabNewsResponseSchema.safeParse(data);
  if (!parsed.success) throw new AppError('DB-1', { message: 'unexpected tab news response' });
  const answer = parsed.data;
  return {
    since: answer.since,
    listSeenAt: answer.list_seen_at,
    forum: {
      unseenPostIds: answer.forum.unseen_post_ids,
      unopenedPostIds: answer.forum.unopened_post_ids,
      newRepliesByPostId: Object.fromEntries(
        answer.forum.new_replies.map((reply) => [reply.post_id, reply.count]),
      ),
    },
    gallery: {
      unseenItemIds: answer.gallery.unseen_item_ids,
      unopenedItemIds: answer.gallery.unopened_item_ids,
    },
    stories: {
      unseenArticleIds: answer.stories.unseen_article_ids,
      unopenedArticleIds: answer.stories.unopened_article_ids,
    },
    guides: {
      unseenArticles: answer.guides.unseen_articles.map(toItemInCategory),
      unopenedArticles: answer.guides.unopened_articles.map(toItemInCategory),
    },
    services: {
      unseenServices: answer.services.unseen_services.map(toItemInCategory),
      unopenedServices: answer.services.unopened_services.map(toItemInCategory),
    },
    mentoring: { changedRequestIds: answer.mentoring.changed_request_ids },
    feedback: { changedSubmissionIds: answer.feedback.changed_submission_ids },
  };
}

const uuidListSchema = z.array(z.uuid());

const listKeySchema = z.union([
  z.enum(['forum', 'gallery', 'stories', 'activities', 'home']),
  z.templateLiteral(['services:', z.uuid()]),
  z.templateLiteral(['guides:', z.uuid()]),
]);

export async function markListsSeen(client: Client, keys: readonly TabListKey[]): Promise<void> {
  const { error } = await client.rpc('mark_lists_seen', {
    p_list_keys: z.array(listKeySchema).parse(keys),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function markTabItemsSeen(client: Client, items: TabItemsSeen): Promise<void> {
  const { error } = await client.rpc('mark_tab_items_seen', {
    p_forum_post_ids: uuidListSchema.parse(items.forumPostIds),
    p_media_item_ids: uuidListSchema.parse(items.mediaItemIds),
    p_article_ids: uuidListSchema.parse(items.articleIds),
    p_service_ids: uuidListSchema.parse(items.serviceIds),
    p_mentoring_request_ids: uuidListSchema.parse(items.mentoringRequestIds),
    p_feedback_submission_ids: uuidListSchema.parse(items.feedbackSubmissionIds),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

function categoryOfListKey(key: TabListKey, kind: 'services' | 'guides'): string | null {
  const prefix = `${kind}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

/**
 * The news once she has seen these lists: their unseen things leave the
 * numbers, and their cards keep "Nou" until she opens them.
 */
export function withListsSeen(news: TabNews, keys: readonly TabListKey[], now: string): TabNews {
  const seen = new Set<TabListKey>(keys);
  const serviceCategories = new Set(keys.map((key) => categoryOfListKey(key, 'services')));
  const guideCategories = new Set(keys.map((key) => categoryOfListKey(key, 'guides')));
  const isInSeenCategory = (categories: ReadonlySet<string | null>, item: TabNewsItemInCategory) =>
    item.categoryId !== null && categories.has(item.categoryId);
  return {
    ...news,
    listSeenAt: { ...news.listSeenAt, ...Object.fromEntries(keys.map((key) => [key, now])) },
    forum: seen.has('forum') ? { ...news.forum, unseenPostIds: [] } : news.forum,
    gallery: seen.has('gallery') ? { ...news.gallery, unseenItemIds: [] } : news.gallery,
    stories: seen.has('stories') ? { ...news.stories, unseenArticleIds: [] } : news.stories,
    guides: {
      ...news.guides,
      unseenArticles: news.guides.unseenArticles.filter(
        (article) => !isInSeenCategory(guideCategories, article),
      ),
    },
    services: {
      ...news.services,
      unseenServices: news.services.unseenServices.filter(
        (service) => !isInSeenCategory(serviceCategories, service),
      ),
    },
  };
}

/** True when the list still has things that raise a number. */
export function hasUnseenInList(news: TabNews, key: TabListKey): boolean {
  if (key === 'forum') return news.forum.unseenPostIds.length > 0;
  if (key === 'gallery') return news.gallery.unseenItemIds.length > 0;
  if (key === 'stories') return news.stories.unseenArticleIds.length > 0;
  const serviceCategory = categoryOfListKey(key, 'services');
  if (serviceCategory !== null) {
    return news.services.unseenServices.some((service) => service.categoryId === serviceCategory);
  }
  const guideCategory = categoryOfListKey(key, 'guides');
  if (guideCategory !== null) {
    return news.guides.unseenArticles.some((article) => article.categoryId === guideCategory);
  }
  return false;
}

/**
 * The news without the things she has just opened, in the numbers and on the
 * cards. Opening her own post also clears the count of its new replies.
 */
export function withTabItemsSeen(news: TabNews, items: TabItemsSeen): TabNews {
  const posts = new Set(items.forumPostIds);
  const mediaItems = new Set(items.mediaItemIds);
  const articles = new Set(items.articleIds);
  const services = new Set(items.serviceIds);
  const requests = new Set(items.mentoringRequestIds);
  const submissions = new Set(items.feedbackSubmissionIds);
  const notIn = (opened: ReadonlySet<string>) => (id: string) => !opened.has(id);
  const itemNotIn = (opened: ReadonlySet<string>) => (item: TabNewsItemInCategory) =>
    !opened.has(item.id);
  return {
    since: news.since,
    listSeenAt: news.listSeenAt,
    forum: {
      unseenPostIds: news.forum.unseenPostIds.filter(notIn(posts)),
      unopenedPostIds: news.forum.unopenedPostIds.filter(notIn(posts)),
      newRepliesByPostId: Object.fromEntries(
        Object.entries(news.forum.newRepliesByPostId).filter(([postId]) => !posts.has(postId)),
      ),
    },
    gallery: {
      unseenItemIds: news.gallery.unseenItemIds.filter(notIn(mediaItems)),
      unopenedItemIds: news.gallery.unopenedItemIds.filter(notIn(mediaItems)),
    },
    stories: {
      unseenArticleIds: news.stories.unseenArticleIds.filter(notIn(articles)),
      unopenedArticleIds: news.stories.unopenedArticleIds.filter(notIn(articles)),
    },
    guides: {
      unseenArticles: news.guides.unseenArticles.filter(itemNotIn(articles)),
      unopenedArticles: news.guides.unopenedArticles.filter(itemNotIn(articles)),
    },
    services: {
      unseenServices: news.services.unseenServices.filter(itemNotIn(services)),
      unopenedServices: news.services.unopenedServices.filter(itemNotIn(services)),
    },
    mentoring: {
      changedRequestIds: news.mentoring.changedRequestIds.filter(notIn(requests)),
    },
    feedback: {
      changedSubmissionIds: news.feedback.changedSubmissionIds.filter(notIn(submissions)),
    },
  };
}

/**
 * True when any of the given things is new for her: unopened, her post with
 * new replies, or her request or suggestion the staff changed.
 */
export function isTabItemNew(news: TabNews, items: TabItemsSeen): boolean {
  const includesAny = (list: readonly string[], ids: readonly string[]) =>
    ids.some((id) => list.includes(id));
  const ids = (list: readonly TabNewsItemInCategory[]) => list.map((item) => item.id);
  return (
    includesAny(news.forum.unopenedPostIds, items.forumPostIds) ||
    items.forumPostIds.some((id) => (news.forum.newRepliesByPostId[id] ?? 0) > 0) ||
    includesAny(news.gallery.unopenedItemIds, items.mediaItemIds) ||
    includesAny(news.stories.unopenedArticleIds, items.articleIds) ||
    includesAny(ids(news.guides.unopenedArticles), items.articleIds) ||
    includesAny(ids(news.services.unopenedServices), items.serviceIds) ||
    includesAny(news.mentoring.changedRequestIds, items.mentoringRequestIds) ||
    includesAny(news.feedback.changedSubmissionIds, items.feedbackSubmissionIds)
  );
}

/** Unseen posts by others plus every new reply on her posts. */
export function forumNewsCount(news: TabNews): number {
  const replies = Object.values(news.forum.newRepliesByPostId).reduce(
    (total, count) => total + count,
    0,
  );
  return news.forum.unseenPostIds.length + replies;
}

/** The Comunitat tab: the forum and the unseen gallery items and stories. */
export function communityNewsCount(news: TabNews): number {
  return (
    forumNewsCount(news) + news.gallery.unseenItemIds.length + news.stories.unseenArticleIds.length
  );
}

/** The Ajuda tab: unseen guides and services. */
export function helpNewsCount(news: TabNews): number {
  return news.guides.unseenArticles.length + news.services.unseenServices.length;
}

/** The Contacte tab without the unread chat messages, which the caller adds. */
export function contactNewsCount(news: TabNews): number {
  return news.mentoring.changedRequestIds.length + news.feedback.changedSubmissionIds.length;
}
