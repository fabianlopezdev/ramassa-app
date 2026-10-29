import { useAuth } from '@ramassa/shared/auth';
import { usePersonCards as useSharedPersonCards } from '@ramassa/shared/profile';
import { supabase } from './supabase';

export function usePersonCards(ids: readonly (string | null | undefined)[]) {
  const { user } = useAuth();
  return useSharedPersonCards(supabase, user?.id ?? null, ids);
}
