/**
 * The hook behind the Activitats number and its "Nou" marks (RAPP-873). It
 * reads the same cached queries as the Inici badge, so it sends no request
 * of its own.
 */

import { buildActivitiesAttention, type ActivitiesAttention } from '@/lib/activities-attention';
import { usePlayerEvents } from '@/lib/player-events';
import { useHomeAttention, useHomeSeen } from '@/lib/use-home-attention';
import { useTabNews } from '@/lib/use-tab-news';
import { useMemo } from 'react';

/** The new activities in Activitats, for the tab number and the list marks. */
export function useActivitiesAttention(): ActivitiesAttention {
  const { data: events } = usePlayerEvents();
  const { data: seen } = useHomeSeen();
  const { nextActivity, isNextActivityUnseen } = useHomeAttention();
  // When she last saw the list: the number counts only what came after (RAPP-873).
  const { data: news } = useTabNews();
  const activitiesSeenAt = news === undefined ? undefined : (news.listSeenAt.activities ?? null);
  return useMemo(
    () =>
      buildActivitiesAttention({
        events,
        seen,
        activitiesSeenAt,
        homeAttention: { nextActivity, isNextActivityUnseen },
      }),
    [activitiesSeenAt, events, isNextActivityUnseen, nextActivity, seen],
  );
}
