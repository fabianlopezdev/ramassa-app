import { washHex } from '../brand-theme';
import { tokens } from '../tokens';

/** How much of the hue its wash keeps: pale enough for dark text, clear enough to tell apart. */
export const SERVICE_CATEGORY_WASH_STRENGTH = 0.14;

/**
 * The colours a service category can carry (RAPP-856), the keys of
 * `tokens.colors.category`. Staff pick one per category; the player app
 * washes the category's icon circle and its list with it.
 */
export const SERVICE_CATEGORY_COLORS = Object.keys(tokens.colors.category) as readonly Extract<
  keyof typeof tokens.colors.category,
  string
>[];

export type ServiceCategoryColor = keyof typeof tokens.colors.category;

export function isServiceCategoryColor(value: string): value is ServiceCategoryColor {
  return Object.hasOwn(tokens.colors.category, value);
}

/** The full-strength hue of a stored colour, or `undefined` for an older value outside the palette. */
export function serviceCategoryHue(value: string): string | undefined {
  return isServiceCategoryColor(value) ? tokens.colors.category[value] : undefined;
}

/**
 * The wash of a stored colour, the one shade the icon circle and the open
 * category's background share, or `undefined` for an older value.
 */
export function serviceCategoryWash(value: string): string | undefined {
  const hue = serviceCategoryHue(value);
  return hue === undefined ? undefined : washHex(hue, SERVICE_CATEGORY_WASH_STRENGTH);
}
