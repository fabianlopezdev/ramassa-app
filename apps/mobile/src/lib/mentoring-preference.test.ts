import { expect, test } from 'bun:test';
import {
  canonicalDateFromPicker,
  canonicalDateToPicker,
  canonicalTimeFromPicker,
  canonicalTimeToPicker,
  clearPreferredDate,
} from './mentoring-preference';

test('a selected local calendar day keeps the canonical YYYY-MM-DD value', () => {
  const selectedDate = new Date(2026, 7, 5, 12, 30);

  expect(canonicalDateFromPicker(selectedDate)).toBe('2026-08-05');
});

test('a selected local time keeps the canonical 24-hour HH:MM value', () => {
  const selectedTime = new Date(2026, 7, 5, 7, 4);

  expect(canonicalTimeFromPicker(selectedTime)).toBe('07:04');
});

test('a stored canonical date opens on the same local calendar day', () => {
  const pickerDate = canonicalDateToPicker('2026-08-05', new Date(2030, 0, 1));

  expect({
    year: pickerDate.getFullYear(),
    month: pickerDate.getMonth() + 1,
    day: pickerDate.getDate(),
  }).toEqual({ year: 2026, month: 8, day: 5 });
});

test('a stored canonical time opens on the same local clock time', () => {
  const pickerTime = canonicalTimeToPicker('07:04', new Date(2030, 0, 1, 18, 45));

  expect({ hour: pickerTime.getHours(), minute: pickerTime.getMinutes() }).toEqual({
    hour: 7,
    minute: 4,
  });
});

test('clearing the optional date also clears its dependent optional time', () => {
  expect(clearPreferredDate()).toEqual({ preferredDate: '', preferredTime: '' });
});
