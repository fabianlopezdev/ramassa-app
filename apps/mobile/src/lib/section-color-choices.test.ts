import { expect, test } from 'bun:test';
import { CATEGORY_COLORS } from '@ramassa/shared/category-colors';
import { SECTION_COLOR_CHOICES } from '@ramassa/shared/section-colors';
import { sectionColorChoices, sectionColorLabelKey } from './section-color-choices';

test('the choices on offer come in their own order', () => {
  expect(sectionColorChoices(CATEGORY_COLORS, 'green')).toEqual(CATEGORY_COLORS);
  expect(sectionColorChoices(SECTION_COLOR_CHOICES, 'primary')).toEqual(SECTION_COLOR_CHOICES);
});

test('an older stored colour outside the choices still shows, last', () => {
  expect(sectionColorChoices(CATEGORY_COLORS, 'accent')).toEqual([...CATEGORY_COLORS, 'accent']);
  expect(sectionColorChoices(SECTION_COLOR_CHOICES, 'info', 'neutral')).toEqual([
    'neutral',
    ...SECTION_COLOR_CHOICES,
    'info',
  ]);
});

test('the no-colour value leads the choices and is never shown twice', () => {
  expect(sectionColorChoices(SECTION_COLOR_CHOICES, 'neutral', 'neutral')).toEqual([
    'neutral',
    ...SECTION_COLOR_CHOICES,
  ]);
  expect(sectionColorChoices(SECTION_COLOR_CHOICES, 'sky', 'neutral')).toEqual([
    'neutral',
    ...SECTION_COLOR_CHOICES,
  ]);
});

test('an empty stored value adds no blank choice', () => {
  expect(sectionColorChoices(CATEGORY_COLORS, '')).toEqual(CATEGORY_COLORS);
});

test('every choice on offer has a label, and an older name has none', () => {
  for (const color of SECTION_COLOR_CHOICES) {
    expect(sectionColorLabelKey(color)).toStartWith('categoryColor');
  }
  expect(sectionColorLabelKey('primary')).toBe('categoryColorPrimary');
  expect(sectionColorLabelKey('sky')).toBe('categoryColorSky');
  expect(sectionColorLabelKey('neutral', 'neutral')).toBe('categoryColorNone');
  expect(sectionColorLabelKey('neutral')).toBeUndefined();
  expect(sectionColorLabelKey('info')).toBeUndefined();
});
