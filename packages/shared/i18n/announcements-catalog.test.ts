import { expect, test } from 'bun:test';
import ar from './locales/ar/announcements.json';
import ca from './locales/ca/announcements.json';
import en from './locales/en/announcements.json';
import es from './locales/es/announcements.json';
import fa from './locales/fa/announcements.json';

test('the announcement editor has the same complete catalog in all five languages', () => {
  const catalanKeys = Object.keys(ca).sort();
  for (const catalog of [es, en, ar, fa]) {
    expect(Object.keys(catalog).sort()).toEqual(catalanKeys);
    expect(Object.values(catalog).every((value) => value.trim().length > 0)).toBe(true);
  }
});
