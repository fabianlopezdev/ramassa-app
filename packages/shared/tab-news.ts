/**
 * What is new for her on Comunitat, Ajuda and Contacte (RAPP-873). Every new
 * thing raises a number on one tab only, and stays new until she opens that
 * thing: a post, a gallery item, a story, a guide, a service, her mentoring
 * request or her suggestion. Opening a section or a list clears nothing. The
 * database works out the lists in `my_tab_news`; the counts and the optimistic
 * updates are pure functions here.
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

export interface TabNews {
  /** What became visible before this moment counts as seen. */
  readonly since: string;
  readonly forum: {
    readonly newPostIds: readonly string[];
    readonly newRepliesByPostId: Readonly<Record<string, number>>;
  };
  readonly gallery: { readonly newItemIds: readonly string[] };
  readonly stories: { readonly newArticleIds: readonly string[] };
  readonly guides: { readonly newArticles: readonly TabNewsItemInCategory[] };
  readonly services: { readonly newServices: readonly TabNewsItemInCategory[] };
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
  forum: { newPostIds: [], newRepliesByPostId: {} },
  gallery: { newItemIds: [] },
  stories: { newArticleIds: [] },
  guides: { newArticles: [] },
  services: { newServices: [] },
  mentoring: { changedRequestIds: [] },
  feedback: { changedSubmissionIds: [] },
};

const itemInCategorySchema = z.object({ id: z.uuid(), category_id: z.uuid().nullable() });

const tabNewsResponseSchema = z.object({
  since: z.iso.datetime({ offset: true }),
  forum: z.object({
    new_post_ids: z.array(z.uuid()),
    new_replies: z.array(z.object({ post_id: z.uuid(), count: z.number().int().positive() })),
  }),
  gallery: z.object({ new_item_ids: z.array(z.uuid()) }),
  stories: z.object({ new_article_ids: z.array(z.uuid()) }),
  guides: z.object({ new_articles: z.array(itemInCategorySchema) }),
  services: z.object({ new_services: z.array(itemInCategorySchema) }),
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
    forum: {
      newPostIds: answer.forum.new_post_ids,
      newRepliesByPostId: Object.fromEntries(
        answer.forum.new_replies.map((reply) => [reply.post_id, reply.count]),
      ),
    },
    gallery: { newItemIds: answer.gallery.new_item_ids },
    stories: { newArticleIds: answer.stories.new_article_ids },
    guides: { newArticles: answer.guides.new_articles.map(toItemInCategory) },
    services: { newServices: answer.services.new_services.map(toItemInCategory) },
    mentoring: { changedRequestIds: answer.mentoring.changed_request_ids },
    feedback: { changedSubmissionIds: answer.feedback.changed_submission_ids },
  };
}

const uuidListSchema = z.array(z.uuid());

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

/**
 * The news without the things she has just opened. Opening her own post also
 * clears the count of its new replies.
 */
export function withTabItemsSeen(news: TabNews, items: TabItemsSeen): TabNews {
  const posts = new Set(items.forumPostIds);
  const mediaItems = new Set(items.mediaItemIds);
  const articles = new Set(items.articleIds);
  const services = new Set(items.serviceIds);
  const requests = new Set(items.mentoringRequestIds);
  const submissions = new Set(items.feedbackSubmissionIds);
  return {
    since: news.since,
    forum: {
      newPostIds: news.forum.newPostIds.filter((id) => !posts.has(id)),
      newRepliesByPostId: Object.fromEntries(
        Object.entries(news.forum.newRepliesByPostId).filter(([postId]) => !posts.has(postId)),
      ),
    },
    gallery: { newItemIds: news.gallery.newItemIds.filter((id) => !mediaItems.has(id)) },
    stories: { newArticleIds: news.stories.newArticleIds.filter((id) => !articles.has(id)) },
    guides: {
      newArticles: news.guides.newArticles.filter((article) => !articles.has(article.id)),
    },
    services: {
      newServices: news.services.newServices.filter((service) => !services.has(service.id)),
    },
    mentoring: {
      changedRequestIds: news.mentoring.changedRequestIds.filter((id) => !requests.has(id)),
    },
    feedback: {
      changedSubmissionIds: news.feedback.changedSubmissionIds.filter((id) => !submissions.has(id)),
    },
  };
}

/** True when any of the given things is new: as a new item, or as her post with new replies. */
export function isTabItemNew(news: TabNews, items: TabItemsSeen): boolean {
  const includesAny = (list: readonly string[], ids: readonly string[]) =>
    ids.some((id) => list.includes(id));
  return (
    includesAny(news.forum.newPostIds, items.forumPostIds) ||
    items.forumPostIds.some((id) => (news.forum.newRepliesByPostId[id] ?? 0) > 0) ||
    includesAny(news.gallery.newItemIds, items.mediaItemIds) ||
    includesAny(news.stories.newArticleIds, items.articleIds) ||
    includesAny(
      news.guides.newArticles.map((article) => article.id),
      items.articleIds,
    ) ||
    includesAny(
      news.services.newServices.map((service) => service.id),
      items.serviceIds,
    ) ||
    includesAny(news.mentoring.changedRequestIds, items.mentoringRequestIds) ||
    includesAny(news.feedback.changedSubmissionIds, items.feedbackSubmissionIds)
  );
}

/** New posts by others plus every new reply on her posts. */
export function forumNewsCount(news: TabNews): number {
  const replies = Object.values(news.forum.newRepliesByPostId).reduce(
    (total, count) => total + count,
    0,
  );
  return news.forum.newPostIds.length + replies;
}

/** The Comunitat tab: the forum, the gallery and the stories. */
export function communityNewsCount(news: TabNews): number {
  return forumNewsCount(news) + news.gallery.newItemIds.length + news.stories.newArticleIds.length;
}

/** The Ajuda tab: new guides and new services. */
export function helpNewsCount(news: TabNews): number {
  return news.guides.newArticles.length + news.services.newServices.length;
}

/** The Contacte tab without the unread chat messages, which the caller adds. */
export function contactNewsCount(news: TabNews): number {
  return news.mentoring.changedRequestIds.length + news.feedback.changedSubmissionIds.length;
}
