/**
 * The hooks behind the numbers on Comunitat, Ajuda and Contacte (RAPP-873):
 * what is new for her, opening a section or an item, and the counts the tab
 * bar shows. They mirror the Inici hooks in `use-home-attention.ts`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  communityNewsCount,
  contactNewsCount,
  EMPTY_TAB_NEWS,
  fetchTabNews,
  helpNewsCount,
  isSameSectionNews,
  isSectionNewsEmpty,
  markHelpItemsSeen,
  markSectionVisited,
  mergeSectionNews,
  withHelpItemsSeen,
  withSectionVisited,
  type HelpItemsSeen,
  type TabNews,
  type TabNewsSection,
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
 * Records that she opened a section. The number drops at once; without
 * connection the request waits and is sent when the connection returns.
 */
function useMarkSectionVisited() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => tabNewsQueryKey(user?.id ?? 'signed-out'), [user?.id]);
  return useMutation({
    mutationKey: ['tab-news-section-visit', user?.id ?? 'signed-out'],
    mutationFn: (section: TabNewsSection) => markSectionVisited(supabase, section),
    onMutate: async (section) => {
      // A fetch started before the mark must not put back what was just cleared.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<TabNews>(queryKey, (current) =>
        current === undefined ? current : withSectionVisited(current, section),
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey }),
  });
}

/** Records services and guides she opened, in the same way. */
function useMarkHelpItemsSeen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => tabNewsQueryKey(user?.id ?? 'signed-out'), [user?.id]);
  return useMutation({
    mutationKey: ['tab-news-help-seen', user?.id ?? 'signed-out'],
    mutationFn: (items: HelpItemsSeen) => markHelpItemsSeen(supabase, items),
    onMutate: async (items) => {
      // A fetch started before the mark must not put back what was just seen.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<TabNews>(queryKey, (current) =>
        current === undefined ? current : withHelpItemsSeen(current, items),
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey }),
  });
}

/**
 * Opening a section clears its number. While the screen is focused and
 * `isActive` is true, the section is marked visited and the hook returns what
 * was new when she arrived, so the cards keep their "Nou" mark during the
 * visit. What arrives while she is looking joins the snapshot and is marked
 * visited too. Leaving the screen or turning `isActive` off ends the visit.
 */
export function useSectionVisit<S extends TabNewsSection>(
  section: S,
  isActive: boolean,
): TabNews[S] {
  const { data: news } = useTabNews();
  const { mutate } = useMarkSectionVisited();
  const [isFocused, setIsFocused] = useState(false);
  const [snapshot, setSnapshot] = useState<TabNews[S]>(EMPTY_TAB_NEWS[section]);
  const markedThisVisit = useRef(false);
  const lastHandledThisVisit = useRef<TabNews[S] | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const isVisiting = isFocused && isActive;
  const arriving = news?.[section];

  useEffect(() => {
    if (!isVisiting) {
      markedThisVisit.current = false;
      lastHandledThisVisit.current = null;
      setSnapshot(EMPTY_TAB_NEWS[section]);
      return;
    }
    if (arriving === undefined) return;
    const hasNews = !isSectionNewsEmpty(section, arriving);
    // The same news delivered twice in one visit, by a fetch already under way or
    // the refetch after a failed mark, is shown once and marked once (RAPP-873).
    const lastHandled = lastHandledThisVisit.current;
    if (hasNews && lastHandled !== null && isSameSectionNews(section, lastHandled, arriving)) {
      return;
    }
    if (hasNews) {
      lastHandledThisVisit.current = arriving;
      setSnapshot((current) => mergeSectionNews(section, current, arriving));
    }
    // The visit itself is recorded once even with nothing new, and again
    // whenever something new arrives while she is looking.
    if (hasNews || !markedThisVisit.current) {
      markedThisVisit.current = true;
      mutate(section);
    }
  }, [arriving, isVisiting, mutate, section]);

  return snapshot;
}

/** Opening a service counts as seeing it. */
export function useMarkServiceSeen(serviceId: string | undefined) {
  const { data: news } = useTabNews();
  const { mutate } = useMarkHelpItemsSeen();
  const isNew =
    serviceId !== undefined &&
    news !== undefined &&
    news.services.newServices.some((service) => service.id === serviceId);
  useEffect(() => {
    if (!isNew || serviceId === undefined) return;
    mutate({ serviceIds: [serviceId], articleIds: [] });
  }, [isNew, mutate, serviceId]);
}

/** Opening a guide counts as seeing it. */
export function useMarkGuideSeen(articleId: string | undefined) {
  const { data: news } = useTabNews();
  const { mutate } = useMarkHelpItemsSeen();
  const isNew =
    articleId !== undefined &&
    news !== undefined &&
    news.guides.newArticles.some((article) => article.id === articleId);
  useEffect(() => {
    if (!isNew || articleId === undefined) return;
    mutate({ serviceIds: [], articleIds: [articleId] });
  }, [articleId, isNew, mutate]);
}
