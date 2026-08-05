import { describe, expect, test } from 'bun:test';
import {
  applyEventQuery,
  areEventTranslationsApproved,
  buildWeeklyRecurrenceRule,
  EVENT_CATEGORY_COLORS,
  EVENT_CATEGORY_ICONS,
  eventCategoryInputSchema,
  eventInputSchema,
  materializeEventOccurrences,
  moveCategory,
  parseWeeklyRecurrenceRule,
  toMadridLocalInput,
  toUtcInstant,
  type EventQueryBuilder,
} from './events';
import { approveTranslation, createTranslationReview } from './translation/index';

const completeTitle = {
  ca: 'Entrenament setmanal',
  es: 'Entrenamiento semanal',
  en: 'Weekly training',
  ar: 'تدريب أسبوعي',
  fa: 'تمرین هفتگی',
};

const validEvent = {
  categoryId: '5eed0000-0000-4000-8002-000000000001',
  title: completeTitle,
  description: null,
  location: 'Camp Municipal de Vic',
  locationUrl: 'https://maps.google.com/?q=Camp+Municipal+de+Vic',
  startsAt: '2026-03-22T17:00:00.000Z',
  endsAt: '2026-03-22T18:30:00.000Z',
  recurrenceRule: null,
  maxParticipants: 18,
  signupMode: 'confirm' as const,
  status: 'published' as const,
  publishedAt: '2026-03-01T09:00:00.000Z',
  expiresAt: null,
};

describe('Europe/Madrid event time', () => {
  test('converts a local form value to UTC and back without using the machine timezone', () => {
    expect(toUtcInstant('2026-03-22T18:00')).toBe('2026-03-22T17:00:00.000Z');
    expect(toMadridLocalInput('2026-03-22T17:00:00.000Z')).toBe('2026-03-22T18:00');
  });

  test('weekly occurrences keep 18:00 in Madrid across the spring DST boundary', () => {
    const occurrences = materializeEventOccurrences({
      startsAtLocal: '2026-03-22T18:00',
      endsAtLocal: '2026-03-22T19:30',
      recurrence: { kind: 'weekly', interval: 1, count: 3 },
    });

    expect(occurrences).toEqual([
      {
        startsAt: '2026-03-22T17:00:00.000Z',
        endsAt: '2026-03-22T18:30:00.000Z',
      },
      {
        startsAt: '2026-03-29T16:00:00.000Z',
        endsAt: '2026-03-29T17:30:00.000Z',
      },
      {
        startsAt: '2026-04-05T16:00:00.000Z',
        endsAt: '2026-04-05T17:30:00.000Z',
      },
    ]);
    expect(occurrences.map((occurrence) => toMadridLocalInput(occurrence.startsAt))).toEqual([
      '2026-03-22T18:00',
      '2026-03-29T18:00',
      '2026-04-05T18:00',
    ]);
  });

  test('a one-off event materializes exactly one occurrence', () => {
    expect(
      materializeEventOccurrences({
        startsAtLocal: '2026-10-18T11:00',
        endsAtLocal: null,
        recurrence: { kind: 'one_off' },
      }),
    ).toEqual([{ startsAt: '2026-10-18T09:00:00.000Z', endsAt: null }]);
  });
});

describe('weekly recurrence rule', () => {
  test('round-trips the supported finite RRULE shape', () => {
    const rule = buildWeeklyRecurrenceRule(2, 8);
    expect(rule).toBe('FREQ=WEEKLY;INTERVAL=2;COUNT=8');
    expect(parseWeeklyRecurrenceRule(rule)).toEqual({ kind: 'weekly', interval: 2, count: 8 });
  });

  test('rejects unbounded, daily, and oversized rules', () => {
    expect(parseWeeklyRecurrenceRule('FREQ=WEEKLY;INTERVAL=1')).toBeNull();
    expect(parseWeeklyRecurrenceRule('FREQ=DAILY;INTERVAL=1;COUNT=4')).toBeNull();
    expect(parseWeeklyRecurrenceRule('FREQ=WEEKLY;INTERVAL=1;COUNT=53')).toBeNull();
  });
});

describe('event validation', () => {
  test('accepts a published event with an https map link and capacity', () => {
    expect(eventInputSchema.parse(validEvent)).toEqual(validEvent);
  });

  test('rejects non-https and javascript map links', () => {
    for (const locationUrl of [
      'http://maps.google.com/?q=Vic',
      'javascript:alert(document.domain)',
    ]) {
      expect(eventInputSchema.safeParse({ ...validEvent, locationUrl }).success).toBe(false);
    }
  });

  test('rejects zero capacity and an end before the start', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, maxParticipants: 0 }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({
        ...validEvent,
        endsAt: '2026-03-22T16:30:00.000Z',
      }).success,
    ).toBe(false);
  });

  test('rejects a signup mode outside the product vocabulary', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, signupMode: 'maybe' }).success).toBe(false);
  });

  test('allows a Catalan-only draft but requires every title language to publish', () => {
    const draft = {
      ...validEvent,
      title: { ca: 'Esdeveniment per revisar' },
      status: 'draft' as const,
      publishedAt: null,
    };
    expect(eventInputSchema.safeParse(draft).success).toBe(true);
    expect(
      eventInputSchema.safeParse({
        ...draft,
        status: 'published',
        publishedAt: validEvent.publishedAt,
      }).success,
    ).toBe(false);
  });
});

describe('event category management', () => {
  test('accepts only the fixed accessible icon and semantic color catalogs', () => {
    const category = {
      name: completeTitle,
      icon: EVENT_CATEGORY_ICONS[0],
      color: EVENT_CATEGORY_COLORS[0],
    };
    expect(eventCategoryInputSchema.safeParse(category).success).toBe(true);
    expect(eventCategoryInputSchema.safeParse({ ...category, icon: 'custom-svg' }).success).toBe(
      false,
    );
    expect(eventCategoryInputSchema.safeParse({ ...category, color: '#ff0000' }).success).toBe(
      false,
    );
  });

  test('moves a dragged category before its target without losing any IDs', () => {
    expect(moveCategory(['training', 'course', 'outing', 'culture'], 'outing', 'training')).toEqual(
      ['outing', 'training', 'course', 'culture'],
    );
  });
});

describe('event list query', () => {
  test('applies lifecycle, category, stable sorting, and paging at the database boundary', () => {
    const calls: string[] = [];
    const builder: EventQueryBuilder = {
      eq(column, value) {
        calls.push(`eq:${column}:${String(value)}`);
        return this;
      },
      gt(column, value) {
        calls.push(`gt:${column}:${String(value)}`);
        return this;
      },
      lte(column, value) {
        calls.push(`lte:${column}:${String(value)}`);
        return this;
      },
      or(filters) {
        calls.push(`or:${filters}`);
        return this;
      },
      order(column, options) {
        calls.push(`order:${column}:${String(options.ascending)}`);
        return this;
      },
      range(from, to) {
        calls.push(`range:${from}:${to}`);
        return this;
      },
    };

    applyEventQuery(
      builder,
      {
        status: 'published',
        category: '5eed0000-0000-4000-8002-000000000001',
        sort: 'starts_at',
        dir: 'asc',
        page: 2,
      },
      new Date('2026-08-04T12:00:00.000Z'),
    );

    expect(calls).toEqual([
      'eq:status:published',
      'lte:published_at:2026-08-04T12:00:00.000Z',
      'or:expires_at.is.null,expires_at.gt.2026-08-04T12:00:00.000Z',
      'eq:category_id:5eed0000-0000-4000-8002-000000000001',
      'order:starts_at:true',
      'order:id:true',
      'range:25:49',
    ]);
  });
});

describe('event translation review gate', () => {
  test('requires approved titles and only requires description review when a description exists', () => {
    let titleReview = createTranslationReview({
      sourceLanguage: 'ca',
      sourceText: completeTitle.ca,
      translations: {
        es: completeTitle.es,
        en: completeTitle.en,
        ar: completeTitle.ar,
        fa: completeTitle.fa,
      },
    });
    for (const language of ['es', 'en', 'ar', 'fa'] as const) {
      titleReview = approveTranslation(titleReview, language);
    }

    expect(areEventTranslationsApproved({ titleReview, descriptionReview: undefined }, false)).toBe(
      true,
    );
    expect(areEventTranslationsApproved({ titleReview, descriptionReview: undefined }, true)).toBe(
      false,
    );
  });
});
