/**
 * The partner entity's own data on the phone (RAPP-411), as the web portal's
 * pages: the impact on the women her entity referred, the month-by-month
 * participation and the tracking of each referred woman. The database scopes
 * every row to her entity and suppresses groups under three people. Kept in
 * memory: the tracking names people.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { fetchEntityDashboard } from '@ramassa/shared/entity-management';
import { supabase } from './supabase';

const entityRoot = (userId: string) => ['entity', userId] as const;

export function useEntityDashboard() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...entityRoot(user?.id ?? 'signed-out'), 'dashboard'],
    queryFn: () => fetchEntityDashboard(supabase),
    enabled: user !== null,
  });
}
