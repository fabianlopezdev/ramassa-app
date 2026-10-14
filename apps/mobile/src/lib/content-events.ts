/**
 * Events for the team on the phone (RAPP-342): the list with the web admin's
 * status and category filters, one event with its sessions, deleting, and the
 * event categories (create, edit, reorder, delete). The database decides who
 * may do what: `events.edit` or `events.publish` to read and write events,
 * `events.publish` to publish or delete, `events.edit` for categories. Kept in
 * memory: the `content` root is not on the disk allow-list.
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
  createEventCategory,
  deleteEvent,
  deleteEventCategory,
  EVENT_PAGE_SIZE,
  fetchEvent,
  fetchEventCategories,
  fetchEventOccurrences,
  fetchEvents,
  reorderEventCategories,
  updateEventCategory,
  type EventCategoryInput,
  type EventStatusFilter,
} from '@ramassa/shared/events';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

export const contentEventsRoot = (userId: string) => ['content', userId, 'events'] as const;

export function useContentEvents(status: EventStatusFilter, category: 'all' | string) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: [...contentEventsRoot(user?.id ?? SIGNED_OUT), 'list', status, category],
    queryFn: ({ pageParam }) =>
      fetchEvents(supabase, { status, category, sort: 'starts_at', dir: 'desc', page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * EVENT_PAGE_SIZE < last.total ? pages.length + 1 : undefined,
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}

export function useContentEvent(eventId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...contentEventsRoot(user?.id ?? SIGNED_OUT), 'one', eventId],
    queryFn: () => fetchEvent(supabase, eventId),
    enabled: user !== null && eventId.length > 0,
  });
}

/** The sessions the database made from the event's schedule. */
export function useContentEventOccurrences(eventId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...contentEventsRoot(user?.id ?? SIGNED_OUT), 'occurrences', eventId],
    queryFn: () => fetchEventOccurrences(supabase, eventId),
    enabled: user !== null && eventId.length > 0,
  });
}

export function useContentEventCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...contentEventsRoot(user?.id ?? SIGNED_OUT), 'categories'],
    queryFn: () => fetchEventCategories(supabase),
    enabled: user !== null,
  });
}

export function useEventActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: contentEventsRoot(user?.id ?? SIGNED_OUT) });
  const remove = useMutation({
    mutationFn: (id: string) => deleteEvent(supabase, id),
    onSuccess: refresh,
  });
  return { remove };
}

export function useEventCategoryActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: contentEventsRoot(user?.id ?? SIGNED_OUT) });
  const save = useMutation({
    mutationFn: (input: { readonly id: string | null; readonly values: EventCategoryInput }) =>
      input.id === null
        ? createEventCategory(supabase, input.values)
        : updateEventCategory(supabase, input.id, input.values),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (orderedIds: readonly string[]) => reorderEventCategories(supabase, orderedIds),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteEventCategory(supabase, id),
    onSuccess: refresh,
  });
  return { save, reorder, remove };
}
