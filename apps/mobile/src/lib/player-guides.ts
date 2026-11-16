import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';

/** How many guides the Ajuda tab shows above "Totes les guies". */
export const LATEST_PLAYER_GUIDES_LIMIT = 3;

/** `all` or a knowledge category id. */
export type PlayerGuideFilter = 'all' | (string & {});

const NO_GUIDES: readonly KnowledgeArticleListRow[] = [];

/**
 * Guides are every published knowledge item except participant stories,
 * which the Comunitat tab lists. The feed arrives newest first.
 */
export function selectPlayerGuides(
  articles: readonly KnowledgeArticleListRow[] | undefined,
): readonly KnowledgeArticleListRow[] {
  if (articles === undefined) return NO_GUIDES;
  return articles.filter((article) => article.content_type !== 'participant_story');
}

export function selectLatestPlayerGuides(
  articles: readonly KnowledgeArticleListRow[] | undefined,
): readonly KnowledgeArticleListRow[] {
  return selectPlayerGuides(articles).slice(0, LATEST_PLAYER_GUIDES_LIMIT);
}

export function filterPlayerGuides(
  guides: readonly KnowledgeArticleListRow[],
  filter: PlayerGuideFilter,
): readonly KnowledgeArticleListRow[] {
  if (filter === 'all') return guides;
  return guides.filter((guide) => guide.category_id === filter);
}

export function countPlayerGuidesByCategory(
  guides: readonly KnowledgeArticleListRow[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = { all: guides.length };
  for (const guide of guides) counts[guide.category_id] = (counts[guide.category_id] ?? 0) + 1;
  return counts;
}
