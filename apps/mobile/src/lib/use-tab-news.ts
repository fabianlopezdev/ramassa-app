/**
 * The hooks behind the numbers on Comunitat, Ajuda and Contacte (RAPP-873):
 * what is new for her, opening a thing, and the counts the tab bar shows. A
 * thing is new until she opens that thing; opening a section or a list clears
 * nothing. They mirror the Inici hooks in `use-home-attention.ts`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  communityNewsCount,
  contactNewsCount,
  fetchTabNews,
  helpNewsCount,
  isTabItemNew,
  markTabItemsSeen,
  NO_TAB_ITEMS_SEEN,
  withTabItemsSeen,
  type TabItemsSeen,
  type TabNews,
} from '@ramassa/shared/tab-news';
import { supabase } from './supabase';

const tabNewsQueryKey = (userId: string) => ['tab-news', userId] as const;

export interface TabNewsCounts {
  readonly community: number;
  readonly help: number;
  readonly contact: number;
}

const NO_TAB_NEWS_COUNTS: TabNewsCounts = { community: 0, help: 0, contact: 0 };

/** What is new for her on Comunitat, Ajuda and Contacte. */
export function useTabNews() {
  const { user } = useAuth();
  return useQuery<TabNews>({
    queryKey: tabNewsQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchTabNews(supabase, signal),
    enabled: user !== null,
  });
}

/** The three tab numbers; zero until the news has loaded. */
export function useTabNewsCounts(): TabNewsCounts {
  const { data: news } = useTabNews();
  return useMemo(
    () =>
      news === undefined
        ? NO_TAB_NEWS_COUNTS
        : {
            community: communityNewsCount(news),
            help: helpNewsCount(news),
            contact: contactNewsCount(news),
          },
    [news],
  );
}

/**
 * Records the things she opened. The number drops at once; without connection
 * the request waits and is sent when the connection returns.
 */
function useMarkTabItemsSeen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => tabNewsQueryKey(user?.id ?? 'signed-out'), [user?.id]);
  return useMutation({
    mutationKey: ['tab-news-items-seen', user?.id ?? 'signed-out'],
    mutationFn: (items: TabItemsSeen) => markTabItemsSeen(supabase, items),
    onMutate: async (items) => {
      // A fetch started before the mark must not put back what was just seen.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<TabNews>(queryKey, (current) =>
        current === undefined ? current : withTabItemsSeen(current, items),
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey }),
  });
}

type TabItemKind = keyof TabItemsSeen;

function oneTabItem(kind: TabItemKind, id: string): TabItemsSeen {
  return { ...NO_TAB_ITEMS_SEEN, [kind]: [id] };
}

/** Opening a thing's own screen counts as seeing it, once it is new. */
function useMarkTabItemSeen(kind: TabItemKind, id: string | undefined) {
  const { data: news } = useTabNews();
  const { mutate } = useMarkTabItemsSeen();
  // One attempt per id while the screen is open: after a failed mark the
  // refetch brings the id back, and marking again would repeat without end
  // while the server keeps failing (RAPP-873).
  const attempted = useRef(new Set<string>());
  const isNew = id !== undefined && news !== undefined && isTabItemNew(news, oneTabItem(kind, id));
  useEffect(() => {
    if (!isNew || id === undefined || attempted.current.has(id)) return;
    attempted.current.add(id);
    mutate(oneTabItem(kind, id));
  }, [id, isNew, kind, mutate]);
}

/** Opening a post: a post by another, or her own post with new replies. */
export function useMarkForumPostSeen(postId: string | undefined) {
  useMarkTabItemSeen('forumPostIds', postId);
}

/** Opening a gallery item. */
export function useMarkGalleryItemSeen(itemId: string | undefined) {
  useMarkTabItemSeen('mediaItemIds', itemId);
}

/** Opening an article, a guide or a story: one screen shows both. */
export function useMarkArticleSeen(articleId: string | undefined) {
  useMarkTabItemSeen('articleIds', articleId);
}

/** The names the guide and story screens use; both are `useMarkArticleSeen`. */
export const useMarkGuideSeen = useMarkArticleSeen;
export const useMarkStorySeen = useMarkArticleSeen;

/** Opening a service. */
export function useMarkServiceSeen(serviceId: string | undefined) {
  useMarkTabItemSeen('serviceIds', serviceId);
}

/** Opening her mentoring request. */
export function useMarkMentoringRequestSeen(requestId: string | undefined) {
  useMarkTabItemSeen('mentoringRequestIds', requestId);
}

/**
 * Tapping a suggestion's row opens it. The returned callback keeps its
 * identity, so a list row does not render again for it, and marks only a
 * suggestion that is new.
 */
export function useMarkSuggestionSeen(): (submissionId: string) => void {
  const { data: news } = useTabNews();
  const { mutate } = useMarkTabItemsSeen();
  const latestNews = useRef(news);
  useEffect(() => {
    latestNews.current = news;
  }, [news]);
  // A tap marks once per tap, so a failed mark cannot repeat by itself.
  return useCallback(
    (submissionId: string) => {
      const current = latestNews.current;
      const items = oneTabItem('feedbackSubmissionIds', submissionId);
      if (current === undefined || !isTabItemNew(current, items)) return;
      mutate(items);
    },
    [mutate],
  );
}
