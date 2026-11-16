import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { playerKnowledgeArticlesQueryKey } from './player-knowledge-key';

/**
 * The Històries segment reads the same published-only selection as the guides
 * list, under the same cache entry, so both screens share one request and one
 * offline copy.
 */
export const communityStoriesQueryKey = playerKnowledgeArticlesQueryKey;

export function selectParticipantStories(
  articles: readonly KnowledgeArticleListRow[],
): readonly KnowledgeArticleListRow[] {
  return articles.filter((article) => article.content_type === 'participant_story');
}
