/**
 * What a section colour picker offers (RAPP-893): the choices in their own
 * order, led by the stored name that stands for no colour when the section
 * has one, and followed by an older stored name outside the choices, so an
 * edit never changes it unseen.
 */
import { type CategoryColor } from '@ramassa/shared/category-colors';
import { SECTION_BRAND_COLOR } from '@ramassa/shared/section-colors';

// The label of each colour, in the services namespace.
const SECTION_COLOR_LABEL_KEYS = {
  [SECTION_BRAND_COLOR]: 'categoryColorPrimary',
  sky: 'categoryColorSky',
  green: 'categoryColorGreen',
  purple: 'categoryColorPurple',
  orange: 'categoryColorOrange',
  pink: 'categoryColorPink',
  teal: 'categoryColorTeal',
  amber: 'categoryColorAmber',
  indigo: 'categoryColorIndigo',
} as const satisfies Record<CategoryColor | typeof SECTION_BRAND_COLOR, string>;

export type SectionColorLabelKey =
  (typeof SECTION_COLOR_LABEL_KEYS)[keyof typeof SECTION_COLOR_LABEL_KEYS] | 'categoryColorNone';

export function sectionColorChoices(
  choices: readonly string[],
  stored: string,
  noColorValue?: string,
): readonly string[] {
  const offered = noColorValue === undefined ? choices : [noColorValue, ...choices];
  return stored.length === 0 || offered.includes(stored) ? offered : [...offered, stored];
}

/** The services key of a colour's label, or `undefined` for an older name, shown as stored. */
export function sectionColorLabelKey(
  value: string,
  noColorValue?: string,
): SectionColorLabelKey | undefined {
  if (value === noColorValue) return 'categoryColorNone';
  return Object.hasOwn(SECTION_COLOR_LABEL_KEYS, value)
    ? SECTION_COLOR_LABEL_KEYS[value as keyof typeof SECTION_COLOR_LABEL_KEYS]
    : undefined;
}
