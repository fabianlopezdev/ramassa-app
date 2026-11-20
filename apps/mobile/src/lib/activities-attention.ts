/**
 * Which activities in Activitats are new to her (RAPP-873), on two levels:
 *
 * - "Nou" on a card: the same rule as on Inici, published after her record
 *   started, not opened and not answered. One card per activity, its earliest
 *   upcoming occurrence. The activity Inici shows says "Nou" here too, because
 *   a word on a card raises no number.
 * - The number on the tab: those new activities published after she last saw
 *   the Activitats list. The new activity Inici shows is left out, because its
 *   number belongs to Inici and one thing counts in one place only.
 */

import {
  isActivityUnseen,
  isPublishedAfterListSeen,
  type HomeAttention,
} from '@/lib/home-attention';
import { filterPlayerEventOccurrences, type PlayerEventOccurrence } from '@ramassa/shared/events';
import type { HomeSeen } from '@ramassa/shared/home-seen';

export interface ActivitiesAttentionSources {
  readonly events: readonly PlayerEventOccurrence[] | undefined;
  /** Not loaded yet: nothing is shown as new, so no mark or number flashes and goes. */
  readonly seen: HomeSeen | undefined;
  /**
   * When she last saw the Activitats list: `null` is never, `undefined` is not
   * loaded yet, and then nothing counts.
   */
  readonly activitiesSeenAt: string | null | undefined;
  /** What Inici shows, to leave its new activity out of this number. */
  readonly homeAttention: Pick<HomeAttention, 'nextActivity' | 'isNextActivityUnseen'>;
}

export interface ActivitiesAttention {
  /** The number on the Activitats tab. */
  readonly count: number;
  /** The occurrences whose card carries the "Nou" mark. */
  readonly newOccurrenceIds: ReadonlySet<string>;
}

const NOTHING_NEW: ActivitiesAttention = { count: 0, newOccurrenceIds: new Set() };

export function buildActivitiesAttention(
  sources: ActivitiesAttentionSources,
  now: Date = new Date(),
): ActivitiesAttention {
  const { events, seen, activitiesSeenAt, homeAttention } = sources;
  if (events === undefined || seen === undefined) return NOTHING_NEW;
  const countedOnHomeEventId = homeAttention.isNextActivityUnseen
    ? homeAttention.nextActivity?.event.id
    : undefined;
  const checkedEventIds = new Set<string>();
  const newOccurrenceIds = new Set<string>();
  let count = 0;
  // Sorted earliest first, so the first occurrence met for an activity is the one to mark.
  for (const row of filterPlayerEventOccurrences(events, 'all', now)) {
    if (checkedEventIds.has(row.event.id)) continue;
    checkedEventIds.add(row.event.id);
    if (!isActivityUnseen(row, seen)) continue;
    newOccurrenceIds.add(row.occurrence_id);
    if (
      row.event.id !== countedOnHomeEventId &&
      isPublishedAfterListSeen(row.event.published_at, activitiesSeenAt)
    ) {
      count += 1;
    }
  }
  if (newOccurrenceIds.size === 0) return NOTHING_NEW;
  return { count, newOccurrenceIds };
}
