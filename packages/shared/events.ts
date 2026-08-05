import { TZDate } from '@date-fns/tz';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMilliseconds, addWeeks, differenceInMilliseconds, format } from 'date-fns';
import { z } from 'zod';
import { AppError } from './errors';
import { languageCodeSchema } from './schemas/language';
import {
  isTranslationReviewPublishable,
  MAX_TRANSLATION_TEXT_LENGTH,
  type TranslationReview,
} from './translation/index';
import type { Database } from './types/database';

export const MADRID_TIME_ZONE = 'Europe/Madrid';
export const EVENT_SIGNUP_MODES = ['none', 'interest', 'confirm'] as const;
export const EVENT_STATUSES = ['draft', 'published'] as const;
export const EVENT_CATEGORY_ICONS = [
  'dumbbell',
  'graduation-cap',
  'theater',
  'briefcase-business',
  'languages',
  'footprints',
  'users',
] as const;
export const EVENT_CATEGORY_COLORS = [
  'primary',
  'secondary',
  'accent',
  'chart-1',
  'chart-2',
  'chart-3',
] as const;
export const MAX_EVENT_TITLE_LENGTH = 200;
export const MAX_EVENT_LOCATION_LENGTH = 500;
export const MAX_EVENT_RECURRENCE_COUNT = 52;
export const MAX_EVENT_RECURRENCE_INTERVAL = 4;

export type EventSignupMode = (typeof EVENT_SIGNUP_MODES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventCategoryIcon = (typeof EVENT_CATEGORY_ICONS)[number];
export type EventCategoryColor = (typeof EVENT_CATEGORY_COLORS)[number];

type Client = SupabaseClient<Database>;

const optionalLocalizedTextSchema = (maximum: number) =>
  z.object({
    ca: z.string().trim().min(1).max(maximum),
    es: z.string().trim().min(1).max(maximum).optional(),
    en: z.string().trim().min(1).max(maximum).optional(),
    ar: z.string().trim().min(1).max(maximum).optional(),
    fa: z.string().trim().min(1).max(maximum).optional(),
  });

const completeLocalizedTextSchema = (maximum: number) =>
  z.object({
    ca: z.string().trim().min(1).max(maximum),
    es: z.string().trim().min(1).max(maximum),
    en: z.string().trim().min(1).max(maximum),
    ar: z.string().trim().min(1).max(maximum),
    fa: z.string().trim().min(1).max(maximum),
  });

export const eventTitleSchema = optionalLocalizedTextSchema(MAX_EVENT_TITLE_LENGTH);
export const eventDescriptionSchema = optionalLocalizedTextSchema(MAX_TRANSLATION_TEXT_LENGTH);
export const eventCategoryNameSchema = completeLocalizedTextSchema(MAX_EVENT_TITLE_LENGTH);

export type EventLocalizedText = z.infer<typeof eventTitleSchema>;

const httpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'Map links must use HTTPS');

function hasEveryLanguage(value: EventLocalizedText): boolean {
  return languageCodeSchema.options.every((language) => {
    const text = value[language];
    return typeof text === 'string' && text.trim().length > 0;
  });
}

export const eventCategoryInputSchema = z.object({
  name: eventCategoryNameSchema,
  icon: z.enum(EVENT_CATEGORY_ICONS),
  color: z.enum(EVENT_CATEGORY_COLORS),
});

export type EventCategoryInput = z.infer<typeof eventCategoryInputSchema>;

export const eventInputSchema = z
  .object({
    categoryId: z.uuid(),
    title: eventTitleSchema,
    description: eventDescriptionSchema.nullable(),
    location: z.string().trim().min(1).max(MAX_EVENT_LOCATION_LENGTH),
    locationUrl: httpsUrlSchema.nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
    recurrenceRule: z.string().nullable(),
    maxParticipants: z.number().int().min(1).max(10_000).nullable(),
    signupMode: z.enum(EVENT_SIGNUP_MODES),
    status: z.enum(EVENT_STATUSES),
    publishedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .superRefine((event, context) => {
    if (
      event.endsAt !== null &&
      new Date(event.endsAt).getTime() <= new Date(event.startsAt).getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must be later than the start',
      });
    }
    if (event.recurrenceRule !== null && parseWeeklyRecurrenceRule(event.recurrenceRule) === null) {
      context.addIssue({
        code: 'custom',
        path: ['recurrenceRule'],
        message: 'The recurrence rule is not supported',
      });
    }
    if (event.expiresAt !== null && event.publishedAt !== null) {
      if (new Date(event.expiresAt).getTime() <= new Date(event.publishedAt).getTime()) {
        context.addIssue({
          code: 'custom',
          path: ['expiresAt'],
          message: 'Expiry must be later than publication',
        });
      }
    }
    if (event.status !== 'published') return;
    if (event.publishedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Published events need a publication time',
      });
    }
    if (!hasEveryLanguage(event.title)) {
      context.addIssue({
        code: 'custom',
        path: ['title'],
        message: 'Every title language must be complete before publication',
      });
    }
    if (event.description !== null && !hasEveryLanguage(event.description)) {
      context.addIssue({
        code: 'custom',
        path: ['description'],
        message: 'Every description language must be complete before publication',
      });
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;

export interface EventTranslationReviews {
  readonly titleReview: TranslationReview | undefined;
  readonly descriptionReview: TranslationReview | undefined;
}

export function areEventTranslationsApproved(
  reviews: EventTranslationReviews,
  hasDescription: boolean,
): boolean {
  if (reviews.titleReview === undefined || !isTranslationReviewPublishable(reviews.titleReview)) {
    return false;
  }
  return (
    !hasDescription ||
    (reviews.descriptionReview !== undefined &&
      isTranslationReviewPublishable(reviews.descriptionReview))
  );
}

export type EventRecurrence =
  | { readonly kind: 'one_off' }
  | { readonly kind: 'weekly'; readonly interval: number; readonly count: number };

export interface EventOccurrenceInput {
  readonly startsAtLocal: string;
  readonly endsAtLocal: string | null;
  readonly recurrence: EventRecurrence;
}

export interface MaterializedEventOccurrence {
  readonly startsAt: string;
  readonly endsAt: string | null;
}

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const WEEKLY_RULE_PATTERN = /^FREQ=WEEKLY;INTERVAL=([1-4]);COUNT=([1-9]|[1-4][0-9]|5[0-2])$/;

function madridDate(localValue: string): TZDate {
  const match = LOCAL_DATE_TIME_PATTERN.exec(localValue);
  if (match === null) throw new RangeError('Invalid local date and time');
  const [, year, month, day, hour, minute] = match;
  const date = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    MADRID_TIME_ZONE,
  );
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid local date and time');
  return date;
}

function utcIso(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

export function toUtcInstant(localValue: string): string {
  return utcIso(madridDate(localValue));
}

export function toMadridLocalInput(utcValue: string): string {
  return format(new TZDate(utcValue, MADRID_TIME_ZONE), "yyyy-MM-dd'T'HH:mm");
}

export function buildWeeklyRecurrenceRule(interval: number, count: number): string {
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_EVENT_RECURRENCE_INTERVAL) {
    throw new RangeError('Invalid recurrence interval');
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_EVENT_RECURRENCE_COUNT) {
    throw new RangeError('Invalid recurrence count');
  }
  return `FREQ=WEEKLY;INTERVAL=${interval};COUNT=${count}`;
}

export function parseWeeklyRecurrenceRule(rule: string): EventRecurrence | null {
  const match = WEEKLY_RULE_PATTERN.exec(rule);
  if (match === null) return null;
  return { kind: 'weekly', interval: Number(match[1]), count: Number(match[2]) };
}

export function materializeEventOccurrences(
  input: EventOccurrenceInput,
): readonly MaterializedEventOccurrence[] {
  const firstStart = madridDate(input.startsAtLocal);
  const firstEnd = input.endsAtLocal === null ? null : madridDate(input.endsAtLocal);
  if (firstEnd !== null && firstEnd.getTime() <= firstStart.getTime()) {
    throw new RangeError('The end must be later than the start');
  }
  const duration = firstEnd === null ? null : differenceInMilliseconds(firstEnd, firstStart);
  const total = input.recurrence.kind === 'one_off' ? 1 : input.recurrence.count;
  const interval = input.recurrence.kind === 'one_off' ? 0 : input.recurrence.interval;

  return Array.from({ length: total }, (_unused, index) => {
    const startsAt = addWeeks(firstStart, index * interval);
    return {
      startsAt: utcIso(startsAt),
      endsAt: duration === null ? null : utcIso(addMilliseconds(startsAt, duration)),
    };
  });
}

export function moveCategory(
  categoryIds: readonly string[],
  draggedId: string,
  targetId: string,
): readonly string[] {
  if (draggedId === targetId) return [...categoryIds];
  const withoutDragged = categoryIds.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1 || !categoryIds.includes(draggedId)) return [...categoryIds];
  return [...withoutDragged.slice(0, targetIndex), draggedId, ...withoutDragged.slice(targetIndex)];
}

export const EVENT_PAGE_SIZE = 25;
export const EVENT_LIFECYCLES = ['draft', 'published', 'scheduled', 'expired'] as const;
export const EVENT_STATUS_FILTERS = ['all', ...EVENT_LIFECYCLES] as const;
export const EVENT_SORT_COLUMNS = ['created_at', 'published_at', 'starts_at'] as const;

export type EventLifecycle = (typeof EVENT_LIFECYCLES)[number];
export type EventStatusFilter = (typeof EVENT_STATUS_FILTERS)[number];
export type EventSortColumn = (typeof EVENT_SORT_COLUMNS)[number];

const eventCategoryFilterSchema = z
  .union([z.literal('all'), z.uuid()])
  .catch('all')
  .default('all');

export const eventSearchSchema = z.object({
  status: z.enum(EVENT_STATUS_FILTERS).catch('all').default('all'),
  category: eventCategoryFilterSchema,
  sort: z.enum(EVENT_SORT_COLUMNS).catch('starts_at').default('starts_at'),
  dir: z.enum(['asc', 'desc']).catch('asc').default('asc'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type EventSearch = z.infer<typeof eventSearchSchema>;

export interface EventCategoryRow {
  readonly id: string;
  readonly name: EventLocalizedText;
  readonly icon: EventCategoryIcon;
  readonly color: EventCategoryColor;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EventListRow {
  readonly id: string;
  readonly category_id: string;
  readonly category: EventCategoryRow;
  readonly title: EventLocalizedText;
  readonly description: EventLocalizedText | null;
  readonly location: string;
  readonly location_url: string | null;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly time_zone: typeof MADRID_TIME_ZONE;
  readonly recurrence_rule: string | null;
  readonly is_recurring: boolean;
  readonly max_participants: number | null;
  readonly signup_mode: EventSignupMode;
  readonly status: EventStatus;
  readonly published_at: string | null;
  readonly expires_at: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EventOccurrenceRow {
  readonly id: string;
  readonly event_id: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
}

export interface EventPage {
  readonly rows: readonly EventListRow[];
  readonly total: number;
}

export interface EventQueryBuilder {
  eq(column: string, value: unknown): EventQueryBuilder;
  gt(column: string, value: unknown): EventQueryBuilder;
  lte(column: string, value: unknown): EventQueryBuilder;
  or(filters: string): EventQueryBuilder;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): EventQueryBuilder;
  range(from: number, to: number): EventQueryBuilder;
}

export function applyEventQuery<T extends EventQueryBuilder>(
  builder: T,
  search: EventSearch,
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

  if (search.category !== 'all') query = query.eq('category_id', search.category) as T;
  query = query.order(search.sort, {
    ascending: search.dir === 'asc',
    nullsFirst: false,
  }) as T;
  query = query.order('id', { ascending: true }) as T;
  const from = (search.page - 1) * EVENT_PAGE_SIZE;
  return query.range(from, from + EVENT_PAGE_SIZE - 1) as T;
}

const CATEGORY_COLUMNS = 'id, name, icon, color, sort_order, created_at, updated_at';
const EVENT_COLUMNS =
  'id, category_id, category:event_categories!events_category_same_org(id, name, icon, color, sort_order, created_at, updated_at), title, description, location, location_url, starts_at, ends_at, time_zone, recurrence_rule, is_recurring, max_participants, signup_mode, status, published_at, expires_at, created_by, created_at, updated_at';

export async function fetchEventCategories(client: Client): Promise<readonly EventCategoryRow[]> {
  const { data, error } = await client
    .from('event_categories')
    .select(CATEGORY_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []) as unknown as EventCategoryRow[];
}

export async function createEventCategory(
  client: Client,
  rawInput: EventCategoryInput,
): Promise<EventCategoryRow> {
  const input = eventCategoryInputSchema.parse(rawInput);
  const categories = await fetchEventCategories(client);
  const sortOrder = Math.max(0, ...categories.map((category) => category.sort_order)) + 10;
  const { data, error } = await client
    .from('event_categories')
    .insert({ ...input, sort_order: sortOrder })
    .select(CATEGORY_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as EventCategoryRow;
}

export async function updateEventCategory(
  client: Client,
  categoryId: string,
  rawInput: EventCategoryInput,
): Promise<EventCategoryRow> {
  const input = eventCategoryInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('event_categories')
    .update(input)
    .eq('id', categoryId)
    .select(CATEGORY_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as EventCategoryRow;
}

export async function reorderEventCategories(
  client: Client,
  orderedIds: readonly string[],
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      client
        .from('event_categories')
        .update({ sort_order: (index + 1) * 10 })
        .eq('id', id),
    ),
  );
  const failed = results.find((result) => result.error !== null);
  if (failed?.error) throw new AppError('DB-1', { message: failed.error.message });
}

export async function deleteEventCategory(client: Client, categoryId: string): Promise<void> {
  const { error } = await client.from('event_categories').delete().eq('id', categoryId);
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function fetchEvents(
  client: Client,
  search: EventSearch,
  now = new Date(),
): Promise<EventPage> {
  const base = client.from('events').select(EVENT_COLUMNS, { count: 'exact' });
  const { data, error, count } = await applyEventQuery(base as never, search, now);
  if (error) throw new AppError('DB-1', { message: (error as { message: string }).message });
  return { rows: (data ?? []) as unknown as EventListRow[], total: count ?? 0 };
}

export async function fetchEvent(client: Client, eventId: string): Promise<EventListRow> {
  const { data, error } = await client
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', eventId)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as EventListRow;
}

export async function fetchEventOccurrences(
  client: Client,
  eventId: string,
): Promise<readonly EventOccurrenceRow[]> {
  const { data, error } = await client
    .from('event_occurrences')
    .select('id, event_id, starts_at, ends_at')
    .eq('event_id', eventId)
    .order('starts_at', { ascending: true });
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []) as EventOccurrenceRow[];
}

function toDatabaseEventValues(input: EventInput) {
  return {
    category_id: input.categoryId,
    title: input.title,
    description: input.description,
    location: input.location,
    location_url: input.locationUrl,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    time_zone: MADRID_TIME_ZONE,
    recurrence_rule: input.recurrenceRule,
    max_participants: input.maxParticipants,
    signup_mode: input.signupMode,
    status: input.status,
    published_at: input.publishedAt,
    expires_at: input.expiresAt,
  };
}

export async function createEvent(client: Client, rawInput: EventInput): Promise<EventListRow> {
  const input = eventInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('events')
    .insert(toDatabaseEventValues(input))
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as EventListRow;
}

export async function updateEvent(
  client: Client,
  eventId: string,
  rawInput: EventInput,
): Promise<EventListRow> {
  const input = eventInputSchema.parse(rawInput);
  const { data, error } = await client
    .from('events')
    .update(toDatabaseEventValues(input))
    .eq('id', eventId)
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as EventListRow;
}

export async function deleteEvent(client: Client, eventId: string): Promise<void> {
  const { error } = await client.from('events').delete().eq('id', eventId);
  if (error) throw new AppError('DB-1', { message: error.message });
}
