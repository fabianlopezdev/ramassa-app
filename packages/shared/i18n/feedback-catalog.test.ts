import { expect, test } from 'bun:test';
import ar from './locales/ar/feedback.json';
import ca from './locales/ca/feedback.json';
import en from './locales/en/feedback.json';
import es from './locales/es/feedback.json';
import fa from './locales/fa/feedback.json';

test('feedback ships the same complete key set in every supported language', () => {
  const expected = Object.keys(ca).toSorted();
  for (const catalog of [es, en, ar, fa]) {
    expect(Object.keys(catalog).toSorted()).toEqual(expected);
    for (const value of Object.values(catalog)) expect(value.trim().length).toBeGreaterThan(0);
  }
});
