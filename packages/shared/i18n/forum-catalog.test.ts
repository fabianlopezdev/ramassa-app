import { describe, expect, test } from 'bun:test';
import ar from './locales/ar/forum.json';
import ca from './locales/ca/forum.json';
import en from './locales/en/forum.json';
import es from './locales/es/forum.json';
import fa from './locales/fa/forum.json';

describe('forum catalog', () => {
  test('all five locales expose the exact same keys', () => {
    const expected = Object.keys(ca).toSorted();
    for (const catalog of [es, en, ar, fa]) {
      expect(Object.keys(catalog).toSorted()).toEqual(expected);
    }
  });

  test('every forum label is a non-empty translated string', () => {
    for (const catalog of [ca, es, en, ar, fa]) {
      const values = Object.values(catalog).flatMap((value) =>
        typeof value === 'string' ? [value] : Object.values(value),
      );
      for (const value of values) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
