import { describe, expect, test } from 'bun:test';
import { CATEGORY_COLORS, categoryWash } from './category-colors';
import {
  isSectionColorChoice,
  SECTION_COLOR_CHOICES,
  sectionHue,
  sectionWash,
} from './section-colors';
import { tokens } from './tokens';

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe('section colours', () => {
  test('staff choose from the club colour and the eight hues, never the urgent red', () => {
    expect(SECTION_COLOR_CHOICES).toEqual(['primary', ...CATEGORY_COLORS]);
    expect(isSectionColorChoice('error')).toBe(false);
    expect(isSectionColorChoice('pink')).toBe(true);
  });

  test('a hue gives the same wash for a section as for a category', () => {
    for (const color of CATEGORY_COLORS) {
      expect(sectionWash(color)).toBe(categoryWash(color)!);
    }
  });

  test('the club colour follows the organization', () => {
    expect(sectionHue('primary')).toBe(tokens.colors.primary.DEFAULT);
    expect(sectionHue('primary', '#AA3300')).toBe('#AA3300');
    expect(sectionWash('primary', '#AA3300')).not.toBe(sectionWash('primary'));
  });

  test('names stored before the palette keep a shade, and a name with no colour has none', () => {
    for (const legacy of ['secondary', 'info', 'accent', 'chart-1', 'chart-2', 'chart-3']) {
      expect(sectionHue(legacy)).toBeDefined();
    }
    expect(sectionHue('neutral')).toBeUndefined();
    expect(sectionWash('neutral')).toBeUndefined();
  });

  // WCAG AA (a hard constraint of the app): body text needs 4.5:1. On a wash,
  // `neutral-500` falls under it, so text on a coloured screen starts at 600.
  test('text from neutral-600 up reads at 4.5:1 or more on every wash', () => {
    const washes = [...SECTION_COLOR_CHOICES, 'error'].map((color) => sectionWash(color)!);
    for (const wash of washes) {
      for (const step of [600, 700, 800, 900] as const) {
        expect(contrast(tokens.colors.neutral[step], wash)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('neutral-500 does not reach 4.5:1 on every wash, so it stays off coloured screens', () => {
    const lowest = Math.min(
      ...[...SECTION_COLOR_CHOICES, 'error'].map((color) =>
        contrast(tokens.colors.neutral[500], sectionWash(color)!),
      ),
    );
    expect(lowest).toBeLessThan(4.5);
  });
});
