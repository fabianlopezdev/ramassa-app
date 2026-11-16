import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';

/**
 * The Històries segment reads the same published-only selection as the guides
 * list, under the same cache entry, so both screens share one request and one
 * offline copy. Keep this key equal to the guides list key in
 * `player-knowledge.ts`; a mismatch only costs a second request.
 */
export const communityStoriesQueryKey = (userId: string) =>
  ['player-knowledge', 'articles', userId] as const;

export function selectParticipantStories(
  articles: readonly KnowledgeArticleListRow[],
): readonly KnowledgeArticleListRow[] {
  return articles.filter((article) => article.content_type === 'participant_story');
}
