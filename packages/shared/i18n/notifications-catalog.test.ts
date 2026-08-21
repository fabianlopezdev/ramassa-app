import { expect, test } from 'bun:test';
import ar from './locales/ar/notifications.json';
import ca from './locales/ca/notifications.json';
import en from './locales/en/notifications.json';
import es from './locales/es/notifications.json';
import fa from './locales/fa/notifications.json';

test('the notification workspace has the same complete catalog in all five languages', () => {
  const catalanKeys = Object.keys(ca).sort();
  for (const catalog of [es, en, ar, fa]) {
    expect(Object.keys(catalog).sort()).toEqual(catalanKeys);
    expect(Object.values(catalog).every((value) => value.trim().length > 0)).toBe(true);
  }
});
