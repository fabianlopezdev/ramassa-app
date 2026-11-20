import type { TabNewsItemInCategory } from '@ramassa/shared/tab-news';

/**
 * What is new in one section of Ajuda (RAPP-873): the number on its switch
 * option and on each category tile count what she has not seen in its list;
 * the cards that say "Nou" are the ones she has not opened.
 */
export interface HelpNewsSummary {
  readonly total: number;
  readonly countsByCategoryId: Readonly<Record<string, number>>;
  readonly newIds: ReadonlySet<string>;
}

/**
 * An item without a category still counts in the section and keeps its mark,
 * but no tile can show it, so it adds to no tile.
 */
export function summarizeHelpNews(
  unseen: readonly TabNewsItemInCategory[],
  unopened: readonly TabNewsItemInCategory[] = unseen,
): HelpNewsSummary {
  const countsByCategoryId: Record<string, number> = {};
  for (const item of unseen) {
    if (item.categoryId === null) continue;
    countsByCategoryId[item.categoryId] = (countsByCategoryId[item.categoryId] ?? 0) + 1;
  }
  return {
    total: unseen.length,
    countsByCategoryId,
    newIds: new Set(unopened.map((item) => item.id)),
  };
}

export const NO_HELP_NEWS: HelpNewsSummary = summarizeHelpNews([]);
