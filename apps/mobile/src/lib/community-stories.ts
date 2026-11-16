import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchPlayerKnowledgeArticles,
  type KnowledgeArticleListRow,
} from '@ramassa/shared/knowledge';
import { communityStoriesQueryKey, selectParticipantStories } from './community-stories-select';
import { supabase } from './supabase';

/** Published participant stories for the Comunitat tab (RAPP-792). */
export function useCommunityStories() {
  const { user } = useAuth();
  return useQuery<readonly KnowledgeArticleListRow[], Error, readonly KnowledgeArticleListRow[]>({
    queryKey: communityStoriesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchPlayerKnowledgeArticles(supabase, { signal }),
    select: selectParticipantStories,
    enabled: user !== null,
  });
}
