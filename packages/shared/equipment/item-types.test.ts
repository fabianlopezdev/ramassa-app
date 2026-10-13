import { describe, expect, test } from 'bun:test';
import { cleanSizes, itemTypeLabel } from './item-types';

const translate = (key: string) => `t:${key}`;

describe('itemTypeLabel', () => {
  test('a built-in reads the app translation', () => {
    expect(
      itemTypeLabel({ key: 'boots', name: null, is_builtin: true }, 'boots', 'en', translate),
    ).toBe('t:boots');
  });

  test('a custom item reads its own name, Catalan when her language is missing', () => {
    const bibs = { key: 'custom_x', name: { ca: 'Petos', en: 'Bibs' }, is_builtin: false };
    expect(itemTypeLabel(bibs, 'custom_x', 'en', translate)).toBe('Bibs');
    expect(itemTypeLabel(bibs, 'custom_x', 'fa', translate)).toBe('Petos');
  });

  test('an item the phone does not know yet falls back to the translation', () => {
    expect(itemTypeLabel(undefined, 'boots', 'ca', translate)).toBe('t:boots');
  });
});

describe('cleanSizes', () => {
  test('trims, drops blanks and repeats, keeps the order', () => {
    expect(cleanSizes([' S', 'M', '', 'M ', 'L'])).toEqual(['S', 'M', 'L']);
  });
});
