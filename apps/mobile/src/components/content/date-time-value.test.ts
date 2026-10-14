import { describe, expect, test } from 'bun:test';
import {
  combineDateAndTime,
  defaultPickerDate,
  fromLocalInputValue,
  fromMadridWallClock,
  madridWallClock,
  toLocalInputValue,
} from './date-time-value';

describe('the date-and-time field', () => {
  test('an empty value starts tomorrow at 09:00', () => {
    const start = defaultPickerDate(null, new Date(2026, 9, 13, 18, 30));
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([14, 9, 0]);
  });

  test('a picked day keeps the time, and a picked time keeps the day', () => {
    const base = new Date(2026, 9, 14, 9, 0);
    const day = combineDateAndTime(base, new Date(2026, 10, 2, 23, 59), 'date');
    expect([day.getMonth(), day.getDate(), day.getHours()]).toEqual([10, 2, 9]);
    const time = combineDateAndTime(base, new Date(2020, 0, 1, 18, 45), 'time');
    expect([time.getDate(), time.getHours(), time.getMinutes()]).toEqual([14, 18, 45]);
  });

  test('the web input value goes both ways, and empty means none', () => {
    const iso = new Date(2026, 9, 14, 18, 45).toISOString();
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso);
    expect(toLocalInputValue(null)).toBe('');
    expect(fromLocalInputValue('')).toBeNull();
  });

  test('an event time is the Madrid wall clock in the picker and back', () => {
    // 16:30 UTC on 14 October 2026 is 18:30 in Madrid (summer time).
    const shown = madridWallClock('2026-10-14T16:30:00.000Z');
    expect([shown.getDate(), shown.getHours(), shown.getMinutes()]).toEqual([14, 18, 30]);
    expect(fromMadridWallClock(shown)).toBe('2026-10-14T16:30:00.000Z');
    // In winter Madrid is one hour ahead of UTC.
    expect(fromMadridWallClock(new Date(2026, 11, 1, 10, 0))).toBe('2026-12-01T09:00:00.000Z');
  });

  test('the web input reads and writes Madrid time for events', () => {
    expect(toLocalInputValue('2026-10-14T16:30:00.000Z', true)).toBe('2026-10-14T18:30');
    expect(fromLocalInputValue('2026-10-14T18:30', true)).toBe('2026-10-14T16:30:00.000Z');
    expect(fromLocalInputValue('', true)).toBeNull();
  });
});
