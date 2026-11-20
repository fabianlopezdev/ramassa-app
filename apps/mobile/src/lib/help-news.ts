import type { TabNewsItemInCategory } from '@ramassa/shared/tab-news';

/**
 * What is new in one section of Ajuda (RAPP-873): the number on its switch
 * option, the number on each category tile and the cards that say "Nou".
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
export function summarizeHelpNews(items: readonly TabNewsItemInCategory[]): HelpNewsSummary {
  const countsByCategoryId: Record<string, number> = {};
  for (const item of items) {
    if (item.categoryId === null) continue;
    countsByCategoryId[item.categoryId] = (countsByCategoryId[item.categoryId] ?? 0) + 1;
  }
  return {
    total: items.length,
    countsByCategoryId,
    newIds: new Set(items.map((item) => item.id)),
  };
}

export const NO_HELP_NEWS: HelpNewsSummary = summarizeHelpNews([]);
