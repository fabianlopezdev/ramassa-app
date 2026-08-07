import { describe, expect, test } from 'bun:test';
import type { PlayerEventOccurrence } from '@ramassa/shared/events';
import { tokens } from '@ramassa/shared/tokens';
import { buildCalendarLocale, buildEventMarkedDates, eventDateKey } from './event-calendar';

const row = (id: string, startsAt: string, categoryId: string): PlayerEventOccurrence =>
  ({
    occurrence_id: id,
    occurrence_starts_at: startsAt,
    occurrence_ends_at: null,
    event: {
      id: `event-${id}`,
      category_id: categoryId,
      category: { id: categoryId, color: 'primary' },
    },
    signup: null,
  }) as PlayerEventOccurrence;

describe('event calendar locale', () => {
  test('Arabic calendar labels stay complete in the Sunday-based locale API order', () => {
    const locale = buildCalendarLocale('ar', 'اليوم');
    const sunday = new Intl.DateTimeFormat('ar-u-ca-gregory', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 7, 2)));

    expect(locale.today).toBe('اليوم');
    expect(locale.monthNames).toHaveLength(12);
    expect(locale.monthNamesShort).toHaveLength(12);
    expect(locale.dayNames).toHaveLength(7);
    expect(locale.dayNamesShort).toHaveLength(7);
    expect(locale.dayNames[0]).toBe(sunday);
    expect(locale.monthNames.every((label) => label.trim().length > 0)).toBe(true);
    expect(locale.monthNamesShort.every((label) => label.trim().length > 0)).toBe(true);
    expect(locale.dayNames.every((label) => label.trim().length > 0)).toBe(true);
    expect(locale.dayNamesShort.every((label) => label.trim().length > 0)).toBe(true);
  });

  test('Farsi uses localized Gregorian month labels for the Gregorian grid', () => {
    const locale = buildCalendarLocale('fa', 'امروز');
    expect(locale.monthNames).toHaveLength(12);
    expect(new Set(locale.monthNames).size).toBe(12);
    expect(locale.dayNames).toHaveLength(7);
  });
});

test('calendar date keys use Madrid local dates at the UTC day boundary', () => {
  expect(eventDateKey('2026-08-05T22:30:00.000Z')).toBe('2026-08-06');
});

test('marked dates expose one dot per category and preserve the selected day', () => {
  const marks = buildEventMarkedDates(
    [
      row('one', '2026-08-08T10:00:00.000Z', 'training'),
      row('two', '2026-08-08T12:00:00.000Z', 'course'),
    ],
    '2026-08-08',
    (categoryId) => (categoryId === 'training' ? '#0077B6' : '#FFD166'),
  );

  expect(marks['2026-08-08']).toEqual({
    selected: true,
    selectedColor: tokens.colors.primary.light,
    dots: [
      { key: 'training', color: '#0077B6' },
      { key: 'course', color: '#FFD166' },
    ],
  });
});

test('calendar presentation colors come from the shared token vocabulary', async () => {
  const source = await Bun.file(new URL('./event-calendar.ts', import.meta.url)).text();

  expect(source).toContain('tokens.colors.primary.light');
  expect(source).not.toMatch(/#[\dA-Fa-f]{3,8}/);
});
