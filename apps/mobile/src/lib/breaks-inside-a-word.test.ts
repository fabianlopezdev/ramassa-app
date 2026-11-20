import { expect, test } from 'bun:test';
import { breaksInsideAWord } from './breaks-inside-a-word';

const lines = (...texts: string[]) => texts.map((text) => ({ text }));

test('a word cut across two lines breaks inside a word', () => {
  expect(breaksInsideAWord(lines('Documentatio', 'n & ', 'Administrativ', 'e'))).toBe(true);
  expect(breaksInsideAWord(lines('Alfabetitzac', 'ió'))).toBe(true);
});

test('a name that wraps between whole words does not', () => {
  expect(breaksInsideAWord(lines('Language ', 'Courses'))).toBe(false);
  expect(breaksInsideAWord(lines('Leisure & ', 'Culture'))).toBe(false);
  expect(breaksInsideAWord(lines('Health'))).toBe(false);
  expect(breaksInsideAWord(lines('Auto-', 'ocupació'))).toBe(false);
});
