import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { languageCodeSchema, type LanguageCode } from './schemas/language';
import {
  isTranslationReviewPublishable,
  MAX_TRANSLATION_TEXT_LENGTH,
  type TranslationReview,
} from './translation/index';
import type { Database } from './types/database';

export const ANNOUNCEMENT_CATEGORIES = ['info', 'training', 'social', 'urgent'] as const;
export const ANNOUNCEMENT_STATUSES = ['draft', 'published'] as const;
export const ANNOUNCEMENT_LIFECYCLES = ['draft', 'published', 'scheduled', 'expired'] as const;
export const ANNOUNCEMENT_STATUS_FILTERS = ['all', ...ANNOUNCEMENT_LIFECYCLES] as const;
export const REQUIRED_CONTENT_LANGUAGES = languageCodeSchema.options;
export const MAX_ANNOUNCEMENT_TITLE_LENGTH = 200;
export const MAX_ANNOUNCEMENT_ALT_LENGTH = 500;

export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
export type AnnouncementLifecycle = (typeof ANNOUNCEMENT_LIFECYCLES)[number];
export type AnnouncementStatusFilter = (typeof ANNOUNCEMENT_STATUS_FILTERS)[number];

const optionalLocalizedTextSchema = (maximum: number) =>
  z.object({
    ca: z.string().trim().min(1).max(maximum),
    es: z.string().trim().min(1).max(maximum).optional(),
    en: z.string().trim().min(1).max(maximum).optional(),
    ar: z.string().trim().min(1).max(maximum).optional(),
    fa: z.string().trim().min(1).max(maximum).optional(),
  });

export const announcementTitleSchema = optionalLocalizedTextSchema(MAX_ANNOUNCEMENT_TITLE_LENGTH);
export const announcementBodySchema = optionalLocalizedTextSchema(MAX_TRANSLATION_TEXT_LENGTH);
export const announcementImageAltSchema = optionalLocalizedTextSchema(MAX_ANNOUNCEMENT_ALT_LENGTH);

export type AnnouncementLocalizedText = z.infer<typeof announcementBodySchema>;

function hasEveryLanguage(value: AnnouncementLocalizedText): boolean {
  return REQUIRED_CONTENT_LANGUAGES.every((language) => {
    const text = value[language];
    return typeof text === 'string' && text.trim().length > 0;
  });
}

export const announcementInputSchema = z
  .object({
    category: z.enum(ANNOUNCEMENT_CATEGORIES),
    title: announcementTitleSchema,
    body: announcementBodySchema,
    imageUrl: z.string().trim().min(1).nullable(),
    imageAlt: announcementImageAltSchema.nullable(),
    isPinned: z.boolean(),
    status: z.enum(ANNOUNCEMENT_STATUSES),
    publishedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .superRefine((announcement, context) => {
    if (announcement.expiresAt !== null && announcement.publishedAt !== null) {
      if (
        new Date(announcement.expiresAt).getTime() <= new Date(announcement.publishedAt).getTime()
      ) {
        context.addIssue({
          code: 'custom',
          path: ['expiresAt'],
          message: 'Expiry must be later than publication',
        });
      }
    }

    if (announcement.imageUrl !== null && announcement.imageAlt === null) {
      context.addIssue({
        code: 'custom',
        path: ['imageAlt'],
        message: 'An attached image requires alt text',
      });
    }

    if (announcement.status !== 'published') return;

    if (announcement.publishedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Published content needs a publication time',
      });
    }
    for (const [field, value] of [
      ['title', announcement.title],
      ['body', announcement.body],
    ] as const) {
      if (!hasEveryLanguage(value)) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Every language must be complete before publication',
        });
      }
    }
    if (
      announcement.imageUrl !== null &&
      (announcement.imageAlt === null || !hasEveryLanguage(announcement.imageAlt))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['imageAlt'],
        message: 'Every image alt text language must be complete before publication',
      });
    }
  });

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export interface ContentSchedule {
  readonly status: AnnouncementStatus;
  readonly publishedAt: string | null;
  readonly expiresAt: string | null;
}

export function isContentVisible(schedule: ContentSchedule, now = new Date()): boolean {
  if (schedule.status !== 'published' || schedule.publishedAt === null) return false;
  const visibleAt = now.getTime();
  if (new Date(schedule.publishedAt).getTime() > visibleAt) return false;
  return schedule.expiresAt === null || new Date(schedule.expiresAt).getTime() > visibleAt;
}

export function getAnnouncementLifecycle(
  schedule: ContentSchedule,
  now = new Date(),
): AnnouncementLifecycle {
  if (schedule.status === 'draft') return 'draft';
  if (schedule.expiresAt !== null && new Date(schedule.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  if (schedule.publishedAt === null || new Date(schedule.publishedAt).getTime() > now.getTime()) {
    return 'scheduled';
  }
  return isContentVisible(schedule, now) ? 'published' : 'expired';
}

export interface AnnouncementTranslationReviews {
  readonly titleReview: TranslationReview | undefined;
  readonly bodyReview: TranslationReview | undefined;
  readonly imageAltReview: TranslationReview | undefined;
}

export function areAnnouncementTranslationsApproved(
  reviews: AnnouncementTranslationReviews,
): boolean {
  if (reviews.titleReview === undefined || reviews.bodyReview === undefined) return false;
  if (!isTranslationReviewPublishable(reviews.titleReview)) return false;
  if (!isTranslationReviewPublishable(reviews.bodyReview)) return false;
  return (
    reviews.imageAltReview === undefined || isTranslationReviewPublishable(reviews.imageAltReview)
  );
}

export function localizedTextFromReview(
  sourceText: string,
  review: TranslationReview | undefined,
): AnnouncementLocalizedText {
  const translations = Object.fromEntries(
    (review?.suggestions ?? [])
      .filter((suggestion) => suggestion.status === 'approved')
      .map((suggestion) => [suggestion.language, suggestion.reviewedText]),
  ) as Partial<Record<LanguageCode, string>>;
  return { ca: sourceText.trim(), ...translations };
}

type Client = SupabaseClient<Database>;

export const ANNOUNCEMENT_PAGE_SIZE = 25;
export const ANNOUNCEMENT_SORT_COLUMNS = [
  'created_at',
  'published_at',
  'expires_at',
  'category',
] as const;
export type AnnouncementSortColumn = (typeof ANNOUNCEMENT_SORT_COLUMNS)[number];

export const announcementSearchSchema = z.object({
  status: z.enum(ANNOUNCEMENT_STATUS_FILTERS).catch('all').default('all'),
  sort: z.enum(ANNOUNCEMENT_SORT_COLUMNS).catch('created_at').default('created_at'),
  dir: z.enum(['asc', 'desc']).catch('desc').default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type AnnouncementSearch = z.infer<typeof announcementSearchSchema>;

export interface AnnouncementListRow {
  readonly id: string;
  readonly category: AnnouncementCategory;
  readonly title: AnnouncementLocalizedText;
  readonly body: AnnouncementLocalizedText;
  readonly image_url: string | null;
  readonly image_alt: AnnouncementLocalizedText | null;
  readonly is_pinned: boolean;
  readonly status: AnnouncementStatus;
  readonly published_at: string | null;
  readonly expires_at: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AnnouncementPage {
  readonly rows: readonly AnnouncementListRow[];
  readonly total: number;
}

export interface AnnouncementQueryBuilder {
  eq(column: string, value: unknown): AnnouncementQueryBuilder;
  gt(column: string, value: unknown): AnnouncementQueryBuilder;
  lte(column: string, value: unknown): AnnouncementQueryBuilder;
  or(filters: string): AnnouncementQueryBuilder;
  order(
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ): AnnouncementQueryBuilder;
  range(from: number, to: number): AnnouncementQueryBuilder;
}

export function applyAnnouncementQuery<T extends AnnouncementQueryBuilder>(
  builder: T,
  search: AnnouncementSearch,
  now = new Date(),
): T {
  let query = builder;
  const timestamp = now.toISOString();

  if (search.status === 'draft') {
    query = query.eq('status', 'draft') as T;
  } else if (search.status === 'published') {
    query = query.eq('status', 'published').lte('published_at', timestamp) as T;
    query = query.or(`expires_at.is.null,expires_at.gt.${timestamp}`) as T;
  } else if (search.status === 'scheduled') {
    query = query.eq('status', 'published').gt('published_at', timestamp) as T;
  } else if (search.status === 'expired') {
    query = query.eq('status', 'published').lte('expires_at', timestamp) as T;
  }

  query = query.order('is_pinned', { ascending: false }) as T;
  query = query.order(search.sort, {
    ascending: search.dir === 'asc',
    nullsFirst: false,
  }) as T;
  query = query.order('id', { ascending: true }) as T;
  const from = (search.page - 1) * ANNOUNCEMENT_PAGE_SIZE;
  return query.range(from, from + ANNOUNCEMENT_PAGE_SIZE - 1) as T;
}

const ANNOUNCEMENT_COLUMNS =
  'id, category, title, body, image_url, image_alt, is_pinned, status, published_at, expires_at, created_by, created_at, updated_at';

export async function fetchAnnouncements(
  client: Client,
  search: AnnouncementSearch,
  now = new Date(),
): Promise<AnnouncementPage> {
  const base = client.from('announcements').select(ANNOUNCEMENT_COLUMNS, { count: 'exact' });
  const { data, error, count } = await applyAnnouncementQuery(base as never, search, now);
  if (error) throw new AppError('DB-1', { message: (error as { message: string }).message });
  return { rows: (data ?? []) as AnnouncementListRow[], total: count ?? 0 };
}

export async function fetchAnnouncement(
  client: Client,
  announcementId: string,
): Promise<AnnouncementListRow> {
  const { data, error } = await client
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('id', announcementId)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as AnnouncementListRow;
}

function toDatabaseValues(input: AnnouncementInput) {
  return {
    category: input.category,
    title: input.title,
    body: input.body,
    image_url: input.imageUrl,
    image_alt: input.imageAlt,
    is_pinned: input.isPinned,
    status: input.status,
    published_at: input.publishedAt,
    expires_at: input.expiresAt,
  };
}

export async function createAnnouncement(
  client: Client,
  rawInput: AnnouncementInput,
): Promise<AnnouncementListRow> {
  const input = announcementInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('announcements')
    .insert(toDatabaseValues(input))
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as AnnouncementListRow;
}

export async function updateAnnouncement(
  client: Client,
  announcementId: string,
  rawInput: AnnouncementInput,
): Promise<AnnouncementListRow> {
  const input = announcementInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('announcements')
    .update(toDatabaseValues(input))
    .eq('id', announcementId)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as AnnouncementListRow;
}

export async function setAnnouncementPinned(
  client: Client,
  announcementId: string,
  isPinned: boolean,
): Promise<void> {
  const { error } = await client
    .from('announcements')
    .update({ is_pinned: isPinned })
    .eq('id', announcementId);
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function deleteAnnouncement(client: Client, announcementId: string): Promise<void> {
  const { error } = await client.from('announcements').delete().eq('id', announcementId);
  if (error) throw new AppError('DB-1', { message: error.message });
}
