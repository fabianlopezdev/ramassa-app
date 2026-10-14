/**
 * The knowledge base for the team on the phone (RAPP-343): the list with the
 * web admin's content and story filters, one resource, its categories, and the
 * story review steps and deleting. The database decides who may do what:
 * `knowledge.edit` or `knowledge.publish` to read and write, `knowledge.publish`
 * to publish (a story too) or delete. Kept in memory: the `content` root is not
 * on the disk allow-list.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  deleteKnowledgeArticle,
  fetchKnowledgeArticle,
  fetchKnowledgeArticles,
  fetchKnowledgeCategories,
  KNOWLEDGE_PAGE_SIZE,
  transitionParticipantStory,
  type KnowledgeKindFilter,
  type KnowledgeStoryStatusFilter,
  type StoryStatus,
} from '@ramassa/shared/knowledge';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

export const contentKnowledgeRoot = (userId: string) => ['content', userId, 'knowledge'] as const;

export function useContentKnowledge(
  kind: KnowledgeKindFilter,
  storyStatus: KnowledgeStoryStatusFilter,
) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: [...contentKnowledgeRoot(user?.id ?? SIGNED_OUT), 'list', kind, storyStatus],
    queryFn: ({ pageParam, signal }) =>
      fetchKnowledgeArticles(supabase, { kind, storyStatus, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * KNOWLEDGE_PAGE_SIZE < last.total ? pages.length + 1 : undefined,
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}

export function useContentKnowledgeArticle(articleId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...contentKnowledgeRoot(user?.id ?? SIGNED_OUT), 'one', articleId],
    queryFn: ({ signal }) => fetchKnowledgeArticle(supabase, articleId, { signal }),
    enabled: user !== null && articleId.length > 0,
  });
}

export function useContentKnowledgeCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...contentKnowledgeRoot(user?.id ?? SIGNED_OUT), 'categories'],
    queryFn: ({ signal }) => fetchKnowledgeCategories(supabase, { signal }),
    enabled: user !== null,
  });
}

export function useKnowledgeActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: contentKnowledgeRoot(user?.id ?? SIGNED_OUT) });
  const transition = useMutation({
    mutationFn: (input: {
      readonly id: string;
      readonly from: StoryStatus;
      readonly to: StoryStatus;
      readonly reviewerNote: string | null;
    }) => transitionParticipantStory(supabase, input.id, input.from, input.to, input.reviewerNote),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteKnowledgeArticle(supabase, id),
    onSuccess: refresh,
  });
  return { transition, remove };
}
