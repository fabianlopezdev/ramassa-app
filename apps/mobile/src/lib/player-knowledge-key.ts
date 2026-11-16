export const playerKnowledgeQueryRoot = 'player-knowledge';

export const playerKnowledgeArticlesQueryKey = (userId: string) =>
  [playerKnowledgeQueryRoot, 'articles', userId] as const;
