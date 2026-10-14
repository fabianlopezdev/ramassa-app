import { describe, expect, test } from 'bun:test';
import { eventInputSchema, type EventListRow } from '@ramassa/shared/events';
import { createTranslationReview, type TranslationReview } from '@ramassa/shared/translation';
import {
  isEventPublishing,
  readEventDraft,
  startingEventDraft,
  toEventInput,
  writeEventDraft,
} from './event-draft';

const NOW = new Date('2026-10-14T10:00:00.000Z');
const CATEGORY = '11111111-1111-4111-8111-111111111111';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => void values.set(key, value),
    remove: (key: string) => values.delete(key),
  };
}

function approved(text: string): TranslationReview {
  const review = createTranslationReview({
    sourceLanguage: 'ca',
    sourceText: text,
    translations: {
      es: `[es] ${text}`,
      en: `[en] ${text}`,
      ar: `[ar] ${text}`,
      fa: `[fa] ${text}`,
    },
  });
  return {
    ...review,
    suggestions: review.suggestions.map((s) => ({ ...s, status: 'approved' as const })),
  };
}

const stored = {
  id: '22222222-2222-4222-8222-222222222222',
  category_id: CATEGORY,
  title: { ca: 'Entrenament', es: 'Entrenamiento', en: 'Training', ar: 'تدريب', fa: 'تمرین' },
  description: null,
  location: 'Pista',
  location_url: null,
  starts_at: '2026-10-20T16:00:00.000Z',
  ends_at: '2026-10-20T17:30:00.000Z',
  recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=8',
  max_participants: 12,
  signup_mode: 'confirm',
  status: 'published',
  published_at: '2026-10-01T08:00:00.000Z',
  expires_at: null,
} as unknown as EventListRow;

describe('the event form (RAPP-342)', () => {
  test('a new event starts empty in the first category; a stored one reads its schedule', () => {
    expect(startingEventDraft(undefined, CATEGORY, NOW)).toMatchObject({
      categoryId: CATEGORY,
      recurrence: 'one_off',
      interval: 1,
      count: '6',
      capacity: '',
      mode: 'draft',
    });
    expect(startingEventDraft(stored, 'other', NOW)).toMatchObject({
      categoryId: CATEGORY,
      recurrence: 'weekly',
      interval: 2,
      count: '8',
      capacity: '12',
      mode: 'now',
    });
  });

  test('a weekly published event becomes a valid input with every language', () => {
    const form = {
      ...startingEventDraft(undefined, CATEGORY, NOW),
      title: 'Taller',
      location: ' Casal ',
      startsAt: '2026-10-21T16:00:00.000Z',
      recurrence: 'weekly' as const,
      interval: 1,
      count: '4',
      capacity: '20',
      mode: 'now' as const,
    };
    const input = toEventInput(
      form,
      { title: approved('Taller'), description: undefined },
      { stored: undefined, canPublish: true, now: NOW },
    );
    expect(input).toMatchObject({
      location: 'Casal',
      locationUrl: null,
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=4',
      maxParticipants: 20,
      status: 'published',
      publishedAt: NOW.toISOString(),
      description: null,
    });
    expect(eventInputSchema.safeParse(input).success).toBe(true);
  });

  test('a count or capacity she has not finished fails the check without throwing', () => {
    const form = {
      ...startingEventDraft(undefined, CATEGORY, NOW),
      title: 'Taller',
      location: 'Casal',
      startsAt: '2026-10-21T16:00:00.000Z',
      recurrence: 'weekly' as const,
    };
    const reviews = { title: undefined, description: undefined };
    const context = { stored: undefined, canPublish: true, now: NOW };
    expect(
      eventInputSchema.safeParse(toEventInput({ ...form, count: '' }, reviews, context)).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse(toEventInput({ ...form, count: '60' }, reviews, context)).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse(toEventInput({ ...form, capacity: '2.5' }, reviews, context))
        .success,
    ).toBe(false);
    expect(eventInputSchema.safeParse(toEventInput(form, reviews, context)).success).toBe(true);
  });

  test('a draft has no publication; a live event keeps the time it went out', () => {
    const draft = toEventInput(
      { ...startingEventDraft(stored, CATEGORY, NOW), mode: 'draft' },
      { title: undefined, description: undefined },
      { stored, canPublish: true, now: NOW },
    );
    expect([draft.status, draft.publishedAt, draft.expiresAt]).toEqual(['draft', null, null]);
    const live = toEventInput(
      startingEventDraft(stored, CATEGORY, NOW),
      { title: approved('Entrenament'), description: undefined },
      { stored, canPublish: true, now: NOW },
    );
    expect(live.publishedAt).toBe('2026-10-01T08:00:00.000Z');
  });

  test('without the publish permission the publication stays as stored', () => {
    const form = { ...startingEventDraft(stored, CATEGORY, NOW), mode: 'draft' as const };
    expect(isEventPublishing(form, stored, false)).toBe(true);
    const input = toEventInput(
      form,
      { title: undefined, description: undefined },
      { stored, canPublish: false, now: NOW },
    );
    expect([input.status, input.publishedAt, input.expiresAt]).toEqual([
      'published',
      '2026-10-01T08:00:00.000Z',
      null,
    ]);
  });

  test('the form is kept per person and per event, and a broken draft is ignored', () => {
    const storage = memoryStorage();
    const form = { ...startingEventDraft(undefined, CATEGORY, NOW), title: 'Esborrany' };
    writeEventDraft(storage, 'u1', 'new', form);
    expect(readEventDraft(storage, 'u1', 'new')?.title).toBe('Esborrany');
    expect(readEventDraft(storage, 'u2', 'new')).toBeNull();
    storage.set('content.event-draft.u1.new', JSON.stringify({ ...form, recurrence: 'daily' }));
    expect(readEventDraft(storage, 'u1', 'new')).toBeNull();
  });
});
