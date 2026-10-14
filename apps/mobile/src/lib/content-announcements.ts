/**
 * Announcements for the team on the phone (RAPP-340): the list with the web
 * admin's status filter, one announcement, pinning and deleting. The database
 * decides who may do what: `announcements.edit` or `announcements.publish` to
 * read and pin, `announcements.publish` to delete. Kept in memory: the
 * `content` root is not on the disk allow-list.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ANNOUNCEMENT_PAGE_SIZE,
  deleteAnnouncement,
  fetchAnnouncement,
  fetchAnnouncements,
  setAnnouncementPinned,
  type AnnouncementStatusFilter,
} from '@ramassa/shared/announcements';
import { useAuth } from '@ramassa/shared/auth';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const root = (userId: string) => ['content', userId, 'announcements'] as const;

export function useContentAnnouncements(status: AnnouncementStatusFilter) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: [...root(user?.id ?? SIGNED_OUT), 'list', status],
    queryFn: ({ pageParam }) =>
      fetchAnnouncements(supabase, { status, sort: 'created_at', dir: 'desc', page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * ANNOUNCEMENT_PAGE_SIZE < last.total ? pages.length + 1 : undefined,
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}

export function useContentAnnouncement(announcementId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...root(user?.id ?? SIGNED_OUT), 'one', announcementId],
    queryFn: () => fetchAnnouncement(supabase, announcementId),
    enabled: user !== null && announcementId.length > 0,
  });
}

export function useAnnouncementActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: root(user?.id ?? SIGNED_OUT) });
  const setPinned = useMutation({
    mutationFn: (input: { readonly id: string; readonly isPinned: boolean }) =>
      setAnnouncementPinned(supabase, input.id, input.isPinned),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(supabase, id),
    onSuccess: refresh,
  });
  return { setPinned, remove };
}
