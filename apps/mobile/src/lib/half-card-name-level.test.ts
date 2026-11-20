import { expect, test } from 'bun:test';
import {
  firstHalfCardNameFit,
  halfCardNameLevel,
  nameBrokeInsideAWord,
} from './half-card-name-level';

const KEY = 'Mentoria\nSuggeriments|361|1';
const OTHER_KEY = 'Mentoring\nSuggestions|361|1';

test('a pair starts at the full size', () => {
  expect(halfCardNameLevel(firstHalfCardNameFit(KEY), KEY)).toBe('full');
});

test('no break keeps the full size', () => {
  const fit = firstHalfCardNameFit(KEY);
  expect(halfCardNameLevel(fit, KEY)).toBe('full');
  expect(fit).toEqual({ key: KEY, level: 'full' });
});

test('a break at the full size steps the pair down to the smaller size', () => {
  const fit = nameBrokeInsideAWord(firstHalfCardNameFit(KEY), KEY, 'full');
  expect(halfCardNameLevel(fit, KEY)).toBe('smaller');
});

test('a break at the smaller size puts the pair one card per row', () => {
  const smaller = nameBrokeInsideAWord(firstHalfCardNameFit(KEY), KEY, 'full');
  const fit = nameBrokeInsideAWord(smaller, KEY, 'smaller');
  expect(halfCardNameLevel(fit, KEY)).toBe('rows');
});

test('two reports at the same level step the pair once', () => {
  const once = nameBrokeInsideAWord(firstHalfCardNameFit(KEY), KEY, 'full');
  const twice = nameBrokeInsideAWord(once, KEY, 'full');
  expect(halfCardNameLevel(twice, KEY)).toBe('smaller');
  expect(twice).toBe(once);
});

test('a break reported for a level the pair has already left changes nothing', () => {
  const smaller = nameBrokeInsideAWord(firstHalfCardNameFit(KEY), KEY, 'full');
  const rows = nameBrokeInsideAWord(smaller, KEY, 'smaller');
  expect(nameBrokeInsideAWord(rows, KEY, 'full')).toBe(rows);
  expect(nameBrokeInsideAWord(rows, KEY, 'smaller')).toBe(rows);
  expect(halfCardNameLevel(rows, KEY)).toBe('rows');
});

test('a new fit key starts again at the full size', () => {
  const smaller = nameBrokeInsideAWord(firstHalfCardNameFit(KEY), KEY, 'full');
  const rows = nameBrokeInsideAWord(smaller, KEY, 'smaller');
  expect(halfCardNameLevel(rows, OTHER_KEY)).toBe('full');
  expect(halfCardNameLevel(rows, 'Mentoria\nSuggeriments|412|1')).toBe('full');
  expect(halfCardNameLevel(rows, 'Mentoria\nSuggeriments|361|1.3')).toBe('full');
});

test('a break under a new fit key steps from the full size of that key', () => {
  const rows = nameBrokeInsideAWord(
    nameBrokeInsideAWord(firstHalfCardNameFit(KEY), KEY, 'full'),
    KEY,
    'smaller',
  );
  const fit = nameBrokeInsideAWord(rows, OTHER_KEY, 'full');
  expect(fit).toEqual({ key: OTHER_KEY, level: 'smaller' });
});

test('a break under a new fit key for a level it has not reached changes nothing', () => {
  const smaller = nameBrokeInsideAWord(firstHalfCardNameFit(KEY), KEY, 'full');
  const fit = nameBrokeInsideAWord(smaller, OTHER_KEY, 'smaller');
  expect(halfCardNameLevel(fit, OTHER_KEY)).toBe('full');
});
