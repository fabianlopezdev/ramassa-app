/**
 * An event being written on the phone (RAPP-342): the form kept on the device
 * through the shared draft store, and the step from the form to the event the
 * database stores, with the web admin's rules. Times are ISO values of Madrid
 * times; the recurrence is weekly or none; empty capacity means no limit.
 *
 * Without `events.publish` the publication goes back exactly as stored,
 * because the database refuses any change to it.
 */
import { z } from 'zod';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import {
  buildWeeklyRecurrenceRule,
  EVENT_SIGNUP_MODES,
  MAX_EVENT_RECURRENCE_INTERVAL,
  parseWeeklyRecurrenceRule,
  type EventInput,
  type EventListRow,
} from '@ramassa/shared/events';
import type { TranslationReview } from '@ramassa/shared/translation';
import { PUBLISH_MODES, type PublishMode } from './announcement-draft';
import { createDraftStore } from './content-draft';

export const EVENT_RECURRENCES = ['one_off', 'weekly'] as const;

const translationsSchema = z.record(z.string(), z.string());

const eventDraftSchema = z.object({
  categoryId: z.string(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  locationUrl: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  recurrence: z.enum(EVENT_RECURRENCES),
  interval: z.number().int().min(1).max(MAX_EVENT_RECURRENCE_INTERVAL),
  /** The number fields are kept as typed, so a half-written number survives. */
  count: z.string(),
  capacity: z.string(),
  signupMode: z.enum(EVENT_SIGNUP_MODES),
  mode: z.enum(PUBLISH_MODES),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  titleTranslations: translationsSchema.optional(),
  descriptionTranslations: translationsSchema.optional(),
});

export type EventDraft = z.infer<typeof eventDraftSchema>;

const store = createDraftStore('event', eventDraftSchema);

export const readEventDraft = store.read;
export const writeEventDraft = store.write;
export const clearEventDraft = store.clear;

export function initialEventMode(event: EventListRow | undefined, now = new Date()): PublishMode {
  if (event === undefined || event.status === 'draft') return 'draft';
  return event.published_at !== null && new Date(event.published_at).getTime() > now.getTime()
    ? 'scheduled'
    : 'now';
}

/** The form for a new event (first category, weekly defaults as the web admin has) or a stored one. */
export function startingEventDraft(
  event: EventListRow | undefined,
  firstCategoryId: string,
  now = new Date(),
): EventDraft {
  const weekly =
    event?.recurrence_rule == null ? null : parseWeeklyRecurrenceRule(event.recurrence_rule);
  return {
    categoryId: event?.category_id ?? firstCategoryId,
    title: event?.title.ca ?? '',
    description: event?.description?.ca ?? '',
    location: event?.location ?? '',
    locationUrl: event?.location_url ?? '',
    startsAt: event?.starts_at ?? null,
    endsAt: event?.ends_at ?? null,
    recurrence: weekly?.kind === 'weekly' ? 'weekly' : 'one_off',
    interval: weekly?.kind === 'weekly' ? weekly.interval : 1,
    count: weekly?.kind === 'weekly' ? String(weekly.count) : '6',
    capacity: event?.max_participants == null ? '' : String(event.max_participants),
    signupMode: event?.signup_mode ?? 'none',
    mode: initialEventMode(event, now),
    publishedAt: event?.published_at ?? null,
    expiresAt: event?.expires_at ?? null,
  };
}

/**
 * The weekly rule; a count out of range gives a rule the shared schema
 * refuses, so the form shows its error instead of throwing.
 */
function weeklyRule(interval: number, count: string): string {
  try {
    return buildWeeklyRecurrenceRule(interval, Number(count.trim()));
  } catch {
    return `FREQ=WEEKLY;INTERVAL=${interval};COUNT=${count.trim()}`;
  }
}

/** True when saving would publish the event (or keep it published). */
export function isEventPublishing(
  form: EventDraft,
  stored: EventListRow | undefined,
  canPublish: boolean,
): boolean {
  return canPublish ? form.mode !== 'draft' : stored?.status === 'published';
}

function publicationTime(form: EventDraft, stored: EventListRow | undefined, now: Date) {
  if (form.mode === 'draft') return null;
  if (form.mode === 'scheduled') return form.publishedAt;
  // Already live: keep the time it went out.
  if (
    stored?.status === 'published' &&
    stored.published_at !== null &&
    new Date(stored.published_at).getTime() <= now.getTime()
  ) {
    return stored.published_at;
  }
  return now.toISOString();
}

/** The event to store; `eventInputSchema` in the shared module checks it. */
export function toEventInput(
  form: EventDraft,
  reviews: {
    readonly title: TranslationReview | undefined;
    readonly description: TranslationReview | undefined;
  },
  context: {
    readonly stored: EventListRow | undefined;
    readonly canPublish: boolean;
    readonly now?: Date;
  },
): EventInput {
  const now = context.now ?? new Date();
  const { stored, canPublish } = context;
  const hasDescription = form.description.trim().length > 0;
  const capacity = form.capacity.trim();
  const publishing = form.mode !== 'draft';
  return {
    categoryId: form.categoryId,
    title: localizedTextFromReview(form.title, reviews.title),
    description: hasDescription
      ? localizedTextFromReview(form.description, reviews.description)
      : null,
    location: form.location.trim(),
    locationUrl: form.locationUrl.trim().length === 0 ? null : form.locationUrl.trim(),
    startsAt: form.startsAt ?? '',
    endsAt: form.endsAt,
    recurrenceRule: form.recurrence === 'weekly' ? weeklyRule(form.interval, form.count) : null,
    maxParticipants: capacity.length === 0 ? null : Number(capacity),
    signupMode: form.signupMode,
    status: canPublish ? (publishing ? 'published' : 'draft') : (stored?.status ?? 'draft'),
    publishedAt: canPublish ? publicationTime(form, stored, now) : (stored?.published_at ?? null),
    expiresAt: canPublish ? (publishing ? form.expiresAt : null) : (stored?.expires_at ?? null),
  };
}
