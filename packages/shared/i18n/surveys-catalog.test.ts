import { expect, test } from 'bun:test';
import ar from './locales/ar/surveys.json';
import ca from './locales/ca/surveys.json';
import en from './locales/en/surveys.json';
import es from './locales/es/surveys.json';
import fa from './locales/fa/surveys.json';

test('survey catalog has identical keys in all supported languages', () => {
  const expected = Object.keys(ca).sort();
  for (const catalog of [es, en, ar, fa]) {
    expect(Object.keys(catalog).sort()).toEqual(expected);
  }
});

test('Arabic and Catalan carry the response attribution disclosure', () => {
  expect(ca.attributedNotice).toContain('no és anònima');
  expect(ar.attributedNotice).toContain('ليس مجهولاً');
});
