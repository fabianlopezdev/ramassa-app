import { describe, expect, test } from 'bun:test';
import ar from './locales/ar/mentoring.json';
import ca from './locales/ca/mentoring.json';
import en from './locales/en/mentoring.json';
import es from './locales/es/mentoring.json';
import fa from './locales/fa/mentoring.json';

describe('mentoring catalog', () => {
  test('all five locales expose the exact same keys', () => {
    const expected = Object.keys(ca).toSorted();
    for (const catalog of [es, en, ar, fa]) {
      expect(Object.keys(catalog).toSorted()).toEqual(expected);
    }
  });

  test('every mentoring label is a non-empty translated string', () => {
    for (const catalog of [ca, es, en, ar, fa]) {
      for (const value of Object.values(catalog)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
