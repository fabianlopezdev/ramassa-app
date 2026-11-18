/**
 * The hooks behind the Inici badge (RAPP-821): what she has seen, marking
 * things as seen, and the one count the tab bar and the Inici screen share.
 */

import { usePlayerAnnouncements } from '@/lib/announcement-feed';
import { useMyCustomForms } from '@/lib/custom-forms';
import { buildHomeAttention, type HomeAttention } from '@/lib/home-attention';
import { usePlayerEvents } from '@/lib/player-events';
import { usePlayerSurveys } from '@/lib/player-surveys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  addHomeSeenItems,
  fetchHomeSeen,
  markHomeItemsSeen,
  type HomeSeen,
  type HomeSeenItems,
} from '@ramassa/shared/home-seen';
import { supabase } from './supabase';

const homeSeenQueryKey = (userId: string) => ['home-seen', userId] as const;

export function useHomeSeen() {
  const { user } = useAuth();
  return useQuery<HomeSeen>({
    queryKey: homeSeenQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchHomeSeen(supabase, signal),
    enabled: user !== null,
  });
}

/**
 * Records items as seen. The phone shows them as seen at once; without
 * connection the request waits and is sent when the connection returns.
 */
export function useMarkHomeItemsSeen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => homeSeenQueryKey(user?.id ?? 'signed-out'), [user?.id]);
  return useMutation({
    mutationKey: ['home-seen-mark', user?.id ?? 'signed-out'],
    mutationFn: (items: HomeSeenItems) => markHomeItemsSeen(supabase, items),
    onMutate: (items) => {
      queryClient.setQueryData<HomeSeen>(queryKey, (current) =>
        current === undefined ? current : addHomeSeenItems(current, items),
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey }),
  });
}

/** Opening an announcement counts as seeing it. */
export function useMarkAnnouncementSeen(announcementId: string | undefined) {
  const { data: seen } = useHomeSeen();
  const { mutate } = useMarkHomeItemsSeen();
  const isRecorded =
    announcementId === undefined ||
    seen === undefined ||
    seen.announcementIds.includes(announcementId);
  useEffect(() => {
    if (isRecorded || announcementId === undefined) return;
    mutate({ announcementIds: [announcementId], eventIds: [] });
  }, [announcementId, isRecorded, mutate]);
}

/** Opening an activity counts as seeing it. */
export function useMarkEventSeen(eventId: string | undefined) {
  const { data: seen } = useHomeSeen();
  const { mutate } = useMarkHomeItemsSeen();
  const isRecorded = eventId === undefined || seen === undefined || seen.eventIds.includes(eventId);
  useEffect(() => {
    if (isRecorded || eventId === undefined) return;
    mutate({ announcementIds: [], eventIds: [eventId] });
  }, [eventId, isRecorded, mutate]);
}

/** Everything on Inici she has not dealt with, for the tab badge and the screen. */
export function useHomeAttention(): HomeAttention {
  const { data: forms } = useMyCustomForms(true);
  const { data: surveys } = usePlayerSurveys();
  const { data: events } = usePlayerEvents();
  const { data: announcements } = usePlayerAnnouncements();
  const { data: seen } = useHomeSeen();
  return useMemo(
    () => buildHomeAttention({ forms, surveys, events, announcements, seen }),
    [announcements, events, forms, seen, surveys],
  );
}
