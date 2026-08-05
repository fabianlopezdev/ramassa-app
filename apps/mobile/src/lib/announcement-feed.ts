import { useQuery } from '@tanstack/react-query';
import { fetchPlayerAnnouncements, type AnnouncementListRow } from '@ramassa/shared/announcements';
import { useAuth } from '@ramassa/shared/auth';
import { supabase } from './supabase';

export const playerAnnouncementsQueryKey = (userId: string) =>
  ['player-announcements', userId] as const;

export function usePlayerAnnouncements() {
  const { user } = useAuth();
  return useQuery<readonly AnnouncementListRow[]>({
    queryKey: playerAnnouncementsQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchPlayerAnnouncements(supabase, { signal }),
    enabled: user !== null,
  });
}
