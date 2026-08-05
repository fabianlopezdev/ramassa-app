import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { languageCodeSchema, type LanguageCode } from './schemas/language';
import type { Database } from './types/database';

export const KNOWLEDGE_CONTENT_TYPES = [
  'article',
  'tutorial',
  'video',
  'external_link',
  'participant_story',
] as const;
export const STORY_STATUSES = [
  'submitted',
  'in_review',
  'changes_requested',
  'published',
  'rejected',
] as const;
export const KNOWLEDGE_KIND_FILTERS = ['all', 'articles', 'stories'] as const;
export const KNOWLEDGE_STORY_STATUS_FILTERS = ['all', ...STORY_STATUSES] as const;
export const MAX_KNOWLEDGE_TITLE_LENGTH = 200;
export const MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH = 10_000;
export const MAX_KNOWLEDGE_STEP_TITLE_LENGTH = 300;
export const MAX_KNOWLEDGE_IMAGE_ALT_LENGTH = 500;
export const MAX_KNOWLEDGE_REVIEWER_NOTE_LENGTH = 2_000;
export const KNOWLEDGE_PAGE_SIZE = 25;

export type KnowledgeContentType = (typeof KNOWLEDGE_CONTENT_TYPES)[number];
export type StoryStatus = (typeof STORY_STATUSES)[number];
export type KnowledgeKindFilter = (typeof KNOWLEDGE_KIND_FILTERS)[number];
export type KnowledgeStoryStatusFilter = (typeof KNOWLEDGE_STORY_STATUS_FILTERS)[number];

const nonEmptyText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalObjectKey = z.string().trim().min(1).max(2_000).nullable();

export const knowledgeBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('paragraph'),
    text: nonEmptyText(MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH),
  }),
  z
    .object({
      type: z.literal('step'),
      title: nonEmptyText(MAX_KNOWLEDGE_STEP_TITLE_LENGTH),
      text: nonEmptyText(MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH),
      imageUrl: optionalObjectKey,
      imageAlt: nonEmptyText(MAX_KNOWLEDGE_IMAGE_ALT_LENGTH).nullable(),
    })
    .superRefine((block, context) => {
      if (block.imageUrl !== null && block.imageAlt === null) {
        context.addIssue({
          code: 'custom',
          path: ['imageAlt'],
          message: 'A step image requires alternative text',
        });
      }
      if (block.imageUrl === null && block.imageAlt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['imageAlt'],
          message: 'Alternative text requires an image',
        });
      }
    }),
]);

export type KnowledgeBlock = z.infer<typeof knowledgeBlockSchema>;
export const knowledgeBlocksSchema = z.array(knowledgeBlockSchema).min(1).max(50);

export const localizedKnowledgeBodySchema = z.object({
  ca: knowledgeBlocksSchema,
  es: knowledgeBlocksSchema.optional(),
  en: knowledgeBlocksSchema.optional(),
  ar: knowledgeBlocksSchema.optional(),
  fa: knowledgeBlocksSchema.optional(),
});
export type LocalizedKnowledgeBody = z.infer<typeof localizedKnowledgeBodySchema>;

export const knowledgeTitleSchema = z.object({
  ca: nonEmptyText(MAX_KNOWLEDGE_TITLE_LENGTH),
  es: nonEmptyText(MAX_KNOWLEDGE_TITLE_LENGTH).optional(),
  en: nonEmptyText(MAX_KNOWLEDGE_TITLE_LENGTH).optional(),
  ar: nonEmptyText(MAX_KNOWLEDGE_TITLE_LENGTH).optional(),
  fa: nonEmptyText(MAX_KNOWLEDGE_TITLE_LENGTH).optional(),
});
export type KnowledgeLocalizedText = z.infer<typeof knowledgeTitleSchema>;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,15}$/;
const VIMEO_ID = /^\d{6,12}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

export function normalizeVideoEmbedUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    const pathParts = url.pathname.split('/').filter(Boolean);
    const videoId =
      host === 'youtu.be'
        ? pathParts[0]
        : pathParts[0] === 'embed'
          ? pathParts[1]
          : url.searchParams.get('v');
    return videoId !== null && videoId !== undefined && YOUTUBE_ID.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : null;
  }

  if (VIMEO_HOSTS.has(host)) {
    const pathParts = url.pathname.split('/').filter(Boolean);
    const videoId = pathParts[0] === 'video' ? pathParts[1] : pathParts[0];
    return videoId !== undefined && VIMEO_ID.test(videoId)
      ? `https://player.vimeo.com/video/${videoId}`
      : null;
  }
  return null;
}

const storyTransitions: Readonly<Record<StoryStatus, readonly StoryStatus[]>> = {
  submitted: ['in_review'],
  in_review: ['changes_requested', 'published', 'rejected'],
  changes_requested: ['submitted'],
  published: [],
  rejected: [],
};

export function canTransitionStoryStatus(from: StoryStatus, to: StoryStatus): boolean {
  return storyTransitions[from].includes(to);
}

function hasEveryLanguage<T>(
  value: Partial<Record<LanguageCode, T>>,
): value is Record<LanguageCode, T> {
  return languageCodeSchema.options.every((language) => value[language] !== undefined);
}

export function hasAlignedKnowledgeBlocks(body: LocalizedKnowledgeBody): boolean {
  if (!hasEveryLanguage(body)) return false;
  const source = body.ca;
  return languageCodeSchema.options.every((language) => {
    const translated = body[language];
    return (
      translated.length === source.length &&
      translated.every((block, index) => block.type === source[index]?.type)
    );
  });
}

export const knowledgeArticleInputSchema = z
  .object({
    categoryId: z.uuid(),
    title: knowledgeTitleSchema,
    body: localizedKnowledgeBodySchema,
    imageUrl: optionalObjectKey,
    videoUrl: z.string().trim().min(1).max(2_000).nullable(),
    externalUrl: z.url().nullable(),
    contentType: z.enum(KNOWLEDGE_CONTENT_TYPES),
    storyStatus: z.enum(STORY_STATUSES).nullable(),
    authorId: z.uuid().nullable(),
    reviewerNote: z.string().trim().max(MAX_KNOWLEDGE_REVIEWER_NOTE_LENGTH).nullable(),
    isPublished: z.boolean(),
    publishedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .superRefine((article, context) => {
    if (article.videoUrl !== null && normalizeVideoEmbedUrl(article.videoUrl) === null) {
      context.addIssue({ code: 'custom', path: ['videoUrl'], message: 'Video URL is not allowed' });
    }
    if (article.externalUrl !== null && !article.externalUrl.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['externalUrl'],
        message: 'External links must use HTTPS',
      });
    }
    if (article.expiresAt !== null && article.publishedAt !== null) {
      if (new Date(article.expiresAt).getTime() <= new Date(article.publishedAt).getTime()) {
        context.addIssue({
          code: 'custom',
          path: ['expiresAt'],
          message: 'Expiry must be later than publication',
        });
      }
    }

    const isStory = article.contentType === 'participant_story';
    if (isStory && (article.authorId === null || article.storyStatus === null)) {
      context.addIssue({
        code: 'custom',
        path: ['authorId'],
        message: 'Participant stories require an author and review state',
      });
    }
    if (!isStory && (article.authorId !== null || article.storyStatus !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['storyStatus'],
        message: 'Only participant stories carry author review state',
      });
    }
    if (isStory && article.storyStatus !== 'published' && article.isPublished) {
      context.addIssue({
        code: 'custom',
        path: ['isPublished'],
        message: 'A story can publish only from the published review state',
      });
    }
    if (isStory && article.storyStatus === 'published' && !article.isPublished) {
      context.addIssue({
        code: 'custom',
        path: ['storyStatus'],
        message: 'A published story must be visible',
      });
    }

    if (!article.isPublished) return;
    if (article.publishedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Published content needs a publication time',
      });
    }
    if (!hasEveryLanguage(article.title)) {
      context.addIssue({
        code: 'custom',
        path: ['title'],
        message: 'Every title language must be complete before publication',
      });
    }
    if (!hasAlignedKnowledgeBlocks(article.body)) {
      context.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'Every body language must have the same complete block structure',
      });
    }
  });

export type KnowledgeArticleInput = z.infer<typeof knowledgeArticleInputSchema>;

export const knowledgeSearchSchema = z.object({
  kind: z.enum(KNOWLEDGE_KIND_FILTERS).catch('all').default('all'),
  storyStatus: z.enum(KNOWLEDGE_STORY_STATUS_FILTERS).catch('all').default('all'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type KnowledgeSearch = z.infer<typeof knowledgeSearchSchema>;

export interface KnowledgeCategoryRow {
  readonly id: string;
  readonly name: KnowledgeLocalizedText;
  readonly slug: string;
  readonly icon: string;
  readonly sort_order: number;
}

export interface KnowledgeArticleListRow {
  readonly id: string;
  readonly category_id: string;
  readonly category: KnowledgeCategoryRow;
  readonly title: KnowledgeLocalizedText;
  readonly body: LocalizedKnowledgeBody;
  readonly image_url: string | null;
  readonly video_url: string | null;
  readonly external_url: string | null;
  readonly content_type: KnowledgeContentType;
  readonly story_status: StoryStatus | null;
  readonly author_id: string | null;
  readonly author_first_name: string | null;
  readonly reviewer_note: string | null;
  readonly is_published: boolean;
  readonly published_at: string | null;
  readonly expires_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface KnowledgeArticlePage {
  readonly rows: readonly KnowledgeArticleListRow[];
  readonly total: number;
}

type Client = SupabaseClient<Database>;
const KNOWLEDGE_COLUMNS =
  'id, category_id, category:knowledge_categories!knowledge_articles_category_same_org(id, name, slug, icon, sort_order), title, body, image_url, video_url, external_url, content_type, story_status, author_id, author_first_name, reviewer_note, is_published, published_at, expires_at, created_at, updated_at';

export async function fetchKnowledgeCategories(client: Client): Promise<KnowledgeCategoryRow[]> {
  const { data, error } = await client
    .from('knowledge_categories')
    .select('id, name, slug, icon, sort_order')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []) as KnowledgeCategoryRow[];
}

export async function fetchKnowledgeArticles(
  client: Client,
  search: KnowledgeSearch,
): Promise<KnowledgeArticlePage> {
  let query = client.from('knowledge_articles').select(KNOWLEDGE_COLUMNS, { count: 'exact' });
  if (search.kind === 'articles') query = query.neq('content_type', 'participant_story');
  if (search.kind === 'stories') query = query.eq('content_type', 'participant_story');
  if (search.storyStatus !== 'all') query = query.eq('story_status', search.storyStatus);
  const from = (search.page - 1) * KNOWLEDGE_PAGE_SIZE;
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + KNOWLEDGE_PAGE_SIZE - 1);
  if (error) throw new AppError('DB-1', { message: error.message });
  return { rows: (data ?? []) as unknown as KnowledgeArticleListRow[], total: count ?? 0 };
}

export async function fetchKnowledgeArticle(
  client: Client,
  articleId: string,
): Promise<KnowledgeArticleListRow> {
  const { data, error } = await client
    .from('knowledge_articles')
    .select(KNOWLEDGE_COLUMNS)
    .eq('id', articleId)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as KnowledgeArticleListRow;
}

function toDatabaseValues(input: KnowledgeArticleInput) {
  return {
    category_id: input.categoryId,
    title: input.title,
    body: input.body,
    image_url: input.imageUrl,
    video_url: input.videoUrl === null ? null : normalizeVideoEmbedUrl(input.videoUrl),
    external_url: input.externalUrl,
    content_type: input.contentType,
    story_status: input.storyStatus,
    author_id: input.authorId,
    reviewer_note: input.reviewerNote,
    is_published: input.isPublished,
    published_at: input.publishedAt,
    expires_at: input.expiresAt,
  };
}

export async function createKnowledgeArticle(
  client: Client,
  rawInput: KnowledgeArticleInput,
): Promise<KnowledgeArticleListRow> {
  const input = knowledgeArticleInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('knowledge_articles')
    .insert(toDatabaseValues(input))
    .select(KNOWLEDGE_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as KnowledgeArticleListRow;
}

export async function updateKnowledgeArticle(
  client: Client,
  articleId: string,
  rawInput: KnowledgeArticleInput,
): Promise<KnowledgeArticleListRow> {
  const input = knowledgeArticleInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('knowledge_articles')
    .update(toDatabaseValues(input))
    .eq('id', articleId)
    .select(KNOWLEDGE_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as KnowledgeArticleListRow;
}

export async function transitionParticipantStory(
  client: Client,
  articleId: string,
  from: StoryStatus,
  to: StoryStatus,
  reviewerNote: string | null,
): Promise<void> {
  if (!canTransitionStoryStatus(from, to)) throw new AppError('VALIDATION-1');
  const { data, error } = await client
    .from('knowledge_articles')
    .update({ story_status: to, reviewer_note: reviewerNote })
    .eq('id', articleId)
    .eq('story_status', from)
    .select('id');
  if (error || data?.length !== 1) {
    throw new AppError('DB-1', { message: error?.message ?? 'Story state changed concurrently' });
  }
}

export async function deleteKnowledgeArticle(client: Client, articleId: string): Promise<void> {
  const { error } = await client.from('knowledge_articles').delete().eq('id', articleId);
  if (error) throw new AppError('DB-1', { message: error.message });
}
