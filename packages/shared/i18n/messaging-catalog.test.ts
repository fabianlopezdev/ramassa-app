import { describe, expect, test } from 'bun:test';
import ar from './locales/ar/messaging.json';
import ca from './locales/ca/messaging.json';
import en from './locales/en/messaging.json';
import es from './locales/es/messaging.json';
import fa from './locales/fa/messaging.json';

describe('messaging catalog', () => {
  test('all five locales expose the exact same keys', () => {
    const expected = Object.keys(ca).toSorted();
    for (const catalog of [es, en, ar, fa])
      expect(Object.keys(catalog).toSorted()).toEqual(expected);
  });

  test('every value is a non-empty translated string', () => {
    for (const catalog of [ca, es, en, ar, fa]) {
      for (const value of Object.values(catalog)) expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
