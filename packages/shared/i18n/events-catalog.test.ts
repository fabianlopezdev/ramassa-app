import { describe, expect, test } from 'bun:test';
import ar from './locales/ar/events.json';
import ca from './locales/ca/events.json';
import en from './locales/en/events.json';
import es from './locales/es/events.json';
import fa from './locales/fa/events.json';

describe('events locale catalog', () => {
  test('all five supported languages expose exactly the Catalan key set', () => {
    const expected = Object.keys(ca).sort();
    for (const catalog of [es, en, ar, fa]) expect(Object.keys(catalog).sort()).toEqual(expected);
  });
});
