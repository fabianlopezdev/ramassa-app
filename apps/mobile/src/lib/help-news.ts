import type { TabNewsItemInCategory } from '@ramassa/shared/tab-news';

/**
 * Ajuda has two levels of new (RAPP-873). The numbers on the tab, on the
 * Serveis or Guies option and on a category tile count what she has not seen
 * in its category list, and drop when she opens that list. The word "Nou" on
 * a card stays until she opens that service or guide.
 */
export interface HelpNumbers {
  readonly total: number;
  readonly countsByCategoryId: Readonly<Record<string, number>>;
}

/**
 * The numbers, from the unseen items. An item without a category counts in
 * the total and on no tile, because no tile can show it.
 */
export function countUnseenHelpItems(unseen: readonly TabNewsItemInCategory[]): HelpNumbers {
  const countsByCategoryId: Record<string, number> = {};
  for (const item of unseen) {
    if (item.categoryId === null) continue;
    countsByCategoryId[item.categoryId] = (countsByCategoryId[item.categoryId] ?? 0) + 1;
  }
  return { total: unseen.length, countsByCategoryId };
}

/** The cards that say "Nou", from the unopened items. */
export function unopenedHelpIds(unopened: readonly TabNewsItemInCategory[]): ReadonlySet<string> {
  return new Set(unopened.map((item) => item.id));
}

export const NO_HELP_NUMBERS: HelpNumbers = countUnseenHelpItems([]);
export const NO_UNOPENED_HELP_IDS: ReadonlySet<string> = unopenedHelpIds([]);
