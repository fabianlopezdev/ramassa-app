/**
 * What is new for her on Comunitat, Ajuda and Contacte (RAPP-873). Every new
 * thing raises a number on one tab only. A section of Comunitat, her mentoring
 * and her suggestions stop counting when she opens them; a service or a guide
 * stops counting when she opens that item. The database works out the lists in
 * `my_tab_news`; the counts and the optimistic updates are pure functions here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { Database } from './types/database';

type Client = SupabaseClient<Database>;

export type TabNewsSection = 'forum' | 'gallery' | 'stories' | 'mentoring' | 'feedback';

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

export interface HelpItemsSeen {
  readonly serviceIds: readonly string[];
  readonly articleIds: readonly string[];
}

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

const tabNewsSectionSchema = z.enum(['forum', 'gallery', 'stories', 'mentoring', 'feedback']);

export async function markSectionVisited(client: Client, section: TabNewsSection): Promise<void> {
  const { error } = await client.rpc('mark_section_visited', {
    p_section: tabNewsSectionSchema.parse(section),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function markHelpItemsSeen(client: Client, items: HelpItemsSeen): Promise<void> {
  const { error } = await client.rpc('mark_help_items_seen', {
    p_service_ids: z.array(z.uuid()).parse(items.serviceIds),
    p_article_ids: z.array(z.uuid()).parse(items.articleIds),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

/** The news with one section emptied, as it is once she has opened that section. */
export function withSectionVisited(news: TabNews, section: TabNewsSection): TabNews {
  switch (section) {
    case 'forum':
      return { ...news, forum: EMPTY_TAB_NEWS.forum };
    case 'gallery':
      return { ...news, gallery: EMPTY_TAB_NEWS.gallery };
    case 'stories':
      return { ...news, stories: EMPTY_TAB_NEWS.stories };
    case 'mentoring':
      return { ...news, mentoring: EMPTY_TAB_NEWS.mentoring };
    case 'feedback':
      return { ...news, feedback: EMPTY_TAB_NEWS.feedback };
  }
}

/** The news without the services and guides she has just opened. */
export function withHelpItemsSeen(news: TabNews, items: HelpItemsSeen): TabNews {
  const seenServices = new Set(items.serviceIds);
  const seenArticles = new Set(items.articleIds);
  return {
    ...news,
    guides: {
      newArticles: news.guides.newArticles.filter((article) => !seenArticles.has(article.id)),
    },
    services: {
      newServices: news.services.newServices.filter((service) => !seenServices.has(service.id)),
    },
  };
}

/** Ids that arrived later go first, the newest-first order the database uses. */
function mergeIds(earlier: readonly string[], later: readonly string[]): readonly string[] {
  return [...new Set([...later, ...earlier])];
}

interface SectionNewsRules<S extends TabNewsSection> {
  readonly isEmpty: (news: TabNews[S]) => boolean;
  readonly merge: (earlier: TabNews[S], later: TabNews[S]) => TabNews[S];
}

const sectionNewsRules: { readonly [S in TabNewsSection]: SectionNewsRules<S> } = {
  forum: {
    isEmpty: (news) =>
      news.newPostIds.length === 0 && Object.keys(news.newRepliesByPostId).length === 0,
    merge: (earlier, later) => {
      const replies: Record<string, number> = { ...earlier.newRepliesByPostId };
      for (const [postId, count] of Object.entries(later.newRepliesByPostId)) {
        replies[postId] = (replies[postId] ?? 0) + count;
      }
      return {
        newPostIds: mergeIds(earlier.newPostIds, later.newPostIds),
        newRepliesByPostId: replies,
      };
    },
  },
  gallery: {
    isEmpty: (news) => news.newItemIds.length === 0,
    merge: (earlier, later) => ({ newItemIds: mergeIds(earlier.newItemIds, later.newItemIds) }),
  },
  stories: {
    isEmpty: (news) => news.newArticleIds.length === 0,
    merge: (earlier, later) => ({
      newArticleIds: mergeIds(earlier.newArticleIds, later.newArticleIds),
    }),
  },
  mentoring: {
    isEmpty: (news) => news.changedRequestIds.length === 0,
    merge: (earlier, later) => ({
      changedRequestIds: mergeIds(earlier.changedRequestIds, later.changedRequestIds),
    }),
  },
  feedback: {
    isEmpty: (news) => news.changedSubmissionIds.length === 0,
    merge: (earlier, later) => ({
      changedSubmissionIds: mergeIds(earlier.changedSubmissionIds, later.changedSubmissionIds),
    }),
  },
};

/** True when a section has nothing new. */
export function isSectionNewsEmpty<S extends TabNewsSection>(
  section: S,
  news: TabNews[S],
): boolean {
  return sectionNewsRules[section].isEmpty(news);
}

/**
 * What she has been shown as new during one visit to a section, plus what
 * arrived while she was looking. A reply count adds up because the database
 * counts only replies after her last visit, and the visit started then.
 */
export function mergeSectionNews<S extends TabNewsSection>(
  section: S,
  earlier: TabNews[S],
  later: TabNews[S],
): TabNews[S] {
  const rules = sectionNewsRules[section];
  return rules.isEmpty(later) ? earlier : rules.merge(earlier, later);
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
