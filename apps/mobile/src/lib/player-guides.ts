import type { KnowledgeArticleListRow, KnowledgeCategoryRow } from '@ramassa/shared/knowledge';

/** `all` or a knowledge category id. */
export type PlayerGuideFilter = 'all' | (string & {});

const NO_GUIDES: readonly KnowledgeArticleListRow[] = [];
const NO_CATEGORIES: readonly KnowledgeCategoryRow[] = [];

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

/** A category with no guide would filter to an empty list, so it is left out. */
export function selectGuideCategories(
  categories: readonly KnowledgeCategoryRow[] | undefined,
  counts: Readonly<Record<string, number>>,
): readonly KnowledgeCategoryRow[] {
  if (categories === undefined) return NO_CATEGORIES;
  return categories.filter(
    (category) => !category.is_base_documents && (counts[category.id] ?? 0) > 0,
  );
}

/** The guides of the Guies list: the club's base documents have their own card (RAPP-972). */
export function withoutBaseDocuments(
  guides: readonly KnowledgeArticleListRow[],
): readonly KnowledgeArticleListRow[] {
  return guides.filter((guide) => !guide.category.is_base_documents);
}

/**
 * The club's published base documents for the Documents segment of Ajuda,
 * newest first like the feed. With none, Ajuda offers no Documents segment
 * (RAPP-972).
 */
export function selectBaseDocuments(
  articles: readonly KnowledgeArticleListRow[] | undefined,
): readonly KnowledgeArticleListRow[] {
  return selectPlayerGuides(articles).filter((guide) => guide.category.is_base_documents);
}
