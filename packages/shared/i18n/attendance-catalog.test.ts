import { describe, expect, test } from 'bun:test';
import ar from './locales/ar/attendance.json';
import ca from './locales/ca/attendance.json';
import en from './locales/en/attendance.json';
import es from './locales/es/attendance.json';
import fa from './locales/fa/attendance.json';

describe('attendance locale catalog', () => {
  test('all five supported languages expose exactly the Catalan key set', () => {
    const expected = Object.keys(ca).sort();
    for (const catalog of [es, en, ar, fa]) expect(Object.keys(catalog).sort()).toEqual(expected);
  });
});
