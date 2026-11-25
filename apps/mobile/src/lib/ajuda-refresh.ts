/**
 * Pulling down on Ajuda asks again for everything the tab shows: the service
 * categories, the guides with their categories, the base documents and what is
 * new for her. Ajuda is one scrolling page whose header stays while the part
 * under it changes with the switch (RAPP-977), so the page owns the one
 * refresh, and a view's "try again" button asks for the same.
 */
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePlayerKnowledgeArticles, usePlayerKnowledgeCategories } from '@/lib/player-knowledge';
import { usePlayerServiceCategories } from '@/lib/player-services';
import { useTabNews } from '@/lib/use-tab-news';
import { useNetworkState } from 'expo-network';
import { useCallback } from 'react';

export function useAjudaRefresh(): {
  readonly refresh: () => void;
  readonly isRefreshing: boolean;
} {
  const isOnline = isNetworkStateOnline(useNetworkState());
  const serviceCategories = usePlayerServiceCategories();
  const guideCategories = usePlayerKnowledgeCategories();
  const articles = usePlayerKnowledgeArticles();
  const { refetch: refetchServiceCategories } = serviceCategories;
  const { refetch: refetchGuideCategories } = guideCategories;
  const { refetch: refetchArticles } = articles;
  const { refetch: refetchNews } = useTabNews();
  const refresh = useCallback(() => {
    void Promise.all([
      refetchServiceCategories(),
      refetchGuideCategories(),
      refetchArticles(),
      refetchNews(),
    ]);
  }, [refetchArticles, refetchGuideCategories, refetchNews, refetchServiceCategories]);
  return {
    refresh,
    isRefreshing:
      (serviceCategories.isRefetching || guideCategories.isRefetching || articles.isRefetching) &&
      isOnline,
  };
}
