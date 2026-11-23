import { useMemo } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { usePersonCards as useSharedPersonCards } from '@ramassa/shared/profile';
import { supabase } from './supabase';

export function usePersonCards(ids: readonly (string | null | undefined)[]) {
  const { user } = useAuth();
  return useSharedPersonCards(supabase, user?.id ?? null, ids);
}

/** Her own card: the photo in every tab's header and her name in Inici's greeting. */
export function useOwnPersonCard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const ids = useMemo(() => [userId], [userId]);
  return usePersonCards(ids).get(userId ?? '');
}
