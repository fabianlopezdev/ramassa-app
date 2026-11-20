import { washHex } from './brand-theme';
import { tokens } from './tokens';

/**
 * The colours a category can carry (RAPP-856, RAPP-868): the keys of
 * `tokens.colors.category`. Staff pick one per service category and per guide
 * category; the player app washes the category's icon circle and its open
 * list with it. Services and guides read this one palette, so a change to it
 * reaches both.
 */

/** How much of the hue its wash keeps: pale enough for dark text, clear enough to tell apart. */
export const CATEGORY_WASH_STRENGTH = 0.14;

export const CATEGORY_COLORS = Object.keys(tokens.colors.category) as readonly Extract<
  keyof typeof tokens.colors.category,
  string
>[];

export type CategoryColor = keyof typeof tokens.colors.category;

export function isCategoryColor(value: string): value is CategoryColor {
  return Object.hasOwn(tokens.colors.category, value);
}

/** The full-strength hue of a stored colour, or `undefined` for an older value outside the palette. */
export function categoryHue(value: string): string | undefined {
  return isCategoryColor(value) ? tokens.colors.category[value] : undefined;
}

/**
 * The wash of a stored colour, the one shade the icon circle and the open
 * category's background share, or `undefined` for an older value.
 */
export function categoryWash(value: string): string | undefined {
  const hue = categoryHue(value);
  return hue === undefined ? undefined : washHex(hue, CATEGORY_WASH_STRENGTH);
}
