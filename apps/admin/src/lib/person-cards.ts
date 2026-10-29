import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { fetchPersonCards, type PersonCard } from '@ramassa/shared/profile';
import { safeAsync } from './observability';
import { supabase } from './supabase';

const EMPTY_CARDS: ReadonlyMap<string, PersonCard> = new Map();

export function usePersonCards(ids: readonly (string | null | undefined)[]) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = useMemo(
    () =>
      [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().slice(0, 200).join(','),
    [ids],
  );
  const [loaded, setLoaded] = useState<{
    userId: string;
    key: string;
    cards: ReadonlyMap<string, PersonCard>;
  } | null>(null);
  useEffect(() => {
    if (userId === null || key === '') return;
    const controller = new AbortController();
    void safeAsync(async () => {
      try {
        return await fetchPersonCards(supabase, key.split(','), controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return [];
        throw error;
      }
    }).then((result) => {
      if (result.ok && !controller.signal.aborted) {
        setLoaded({ userId, key, cards: new Map(result.value.map((card) => [card.id, card])) });
      }
    });
    return () => controller.abort();
  }, [key, userId]);
  return loaded?.userId === userId && loaded.key === key ? loaded.cards : EMPTY_CARDS;
}
