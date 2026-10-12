import { expect, test } from 'bun:test';
import { todaySections } from './today';

test('Today shows a section per area she may use, field work first', () => {
  expect(todaySections(['messages', 'attendance'])).toEqual(['attendance', 'messages']);
  expect(todaySections(['messages'])).toEqual(['messages']);
  expect(todaySections([])).toEqual([]);
});
