import { washHex } from './brand-theme';
import { CATEGORY_COLORS, CATEGORY_WASH_STRENGTH, categoryHue } from './category-colors';
import { tokens } from './tokens';

/**
 * The colour of a section of the player app (RAPP-893): the kind of an avís,
 * a forum category, a service or guide category, an activity category. All of
 * them read this one palette, so a topic keeps one colour in every place it
 * shows, and a card and the screen it opens share one shade.
 *
 * A stored colour is a name. The eight hues of `tokens.colors.category` are
 * the topics; `primary` is the club's own colour, for its football; `error`
 * is the red of an urgent avís, set in code only and never offered to staff.
 */

/** The club's own colour, which a white-label organization changes. */
export const SECTION_BRAND_COLOR = 'primary';

/** The red of an urgent avís. No picker offers it. */
export const SECTION_URGENT_COLOR = 'error';

/** What staff choose from for a forum category or an activity category. */
export const SECTION_COLOR_CHOICES = [SECTION_BRAND_COLOR, ...CATEGORY_COLORS] as const;

export type SectionColorChoice = (typeof SECTION_COLOR_CHOICES)[number];

export function isSectionColorChoice(value: string): value is SectionColorChoice {
  return (SECTION_COLOR_CHOICES as readonly string[]).includes(value);
}

/**
 * Names stored before the shared palette, with the shade each keeps until
 * its row is moved to a palette name: the forum's free words and the six
 * names activity categories had.
 */
const LEGACY_SECTION_HUES: Readonly<Record<string, string>> = {
  secondary: tokens.colors.secondary.dark,
  info: tokens.colors.info,
  accent: tokens.colors.info,
  'chart-1': tokens.colors.success,
  'chart-2': tokens.colors.warning,
  'chart-3': tokens.colors.error,
};

/**
 * The full-strength shade of a stored colour, for a dot or a swatch, or
 * `undefined` for a name with no colour, such as the forum's `neutral`.
 * `brandColor` is the organization's own colour when it has changed it.
 */
export function sectionHue(
  value: string,
  brandColor: string = tokens.colors.primary.DEFAULT,
): string | undefined {
  if (value === SECTION_BRAND_COLOR) return brandColor;
  if (value === SECTION_URGENT_COLOR) return tokens.colors.error;
  return categoryHue(value) ?? LEGACY_SECTION_HUES[value];
}

/**
 * The pale, solid wash of a stored colour: the one shade a card's face, an
 * icon circle and the screen the card opens all share. `undefined` for a name
 * with no colour.
 */
export function sectionWash(
  value: string,
  brandColor: string = tokens.colors.primary.DEFAULT,
): string | undefined {
  const hue = sectionHue(value, brandColor);
  return hue === undefined ? undefined : washHex(hue, CATEGORY_WASH_STRENGTH);
}
