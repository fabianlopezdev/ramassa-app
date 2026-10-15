import { expect, test } from 'bun:test';
import { impactPeriodRange } from './impact-period';

test('the periods end on the Madrid day and count whole days back', () => {
  // 23:30 UTC on 15 October is already 16 October in Madrid.
  const now = new Date('2026-10-15T23:30:00Z');
  expect(impactPeriodRange('week', now)).toEqual({
    startDate: '2026-10-10',
    endDate: '2026-10-16',
  });
  expect(impactPeriodRange('month', now)).toEqual({
    startDate: '2026-09-17',
    endDate: '2026-10-16',
  });
  expect(impactPeriodRange('year', now)).toEqual({
    startDate: '2026-01-01',
    endDate: '2026-10-16',
  });
});

test('a period across the end of daylight saving keeps whole days', () => {
  const now = new Date('2026-10-27T10:00:00Z');
  expect(impactPeriodRange('week', now)).toEqual({
    startDate: '2026-10-21',
    endDate: '2026-10-27',
  });
});

test('the first days of January give this year from 1 January', () => {
  expect(impactPeriodRange('year', new Date('2027-01-01T08:00:00Z'))).toEqual({
    startDate: '2027-01-01',
    endDate: '2027-01-01',
  });
});
