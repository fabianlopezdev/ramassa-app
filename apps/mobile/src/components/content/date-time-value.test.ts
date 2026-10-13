import { describe, expect, test } from 'bun:test';
import {
  combineDateAndTime,
  defaultPickerDate,
  fromLocalInputValue,
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
});
