/**
 * Which activities in Activitats are new to her (RAPP-873). The number on the
 * Activitats tab and the "Nou" marks in its list are both built here, so the
 * number always equals the marked cards she finds when she opens the tab.
 *
 * - New means the same as on Inici: published after her record started, not
 *   opened and not answered.
 * - The activity Inici counts is left out, so one activity never counts twice.
 * - An activity counts once however many times it happens; the mark goes on
 *   its earliest upcoming occurrence.
 */

import { isActivityUnseen, type HomeAttention } from '@/lib/home-attention';
import { filterPlayerEventOccurrences, type PlayerEventOccurrence } from '@ramassa/shared/events';
import type { HomeSeen } from '@ramassa/shared/home-seen';

export interface ActivitiesAttentionSources {
  readonly events: readonly PlayerEventOccurrence[] | undefined;
  /** Not loaded yet: nothing is shown as new, so no number flashes and goes. */
  readonly seen: HomeSeen | undefined;
  /** What Inici counts, to leave its activity out of this count. */
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
  const { events, seen, homeAttention } = sources;
  if (events === undefined || seen === undefined) return NOTHING_NEW;
  const countedOnHomeEventId = homeAttention.isNextActivityUnseen
    ? homeAttention.nextActivity?.event.id
    : undefined;
  const checkedEventIds = new Set<string>();
  const newOccurrenceIds = new Set<string>();
  // Sorted earliest first, so the first occurrence met for an activity is the one to mark.
  for (const row of filterPlayerEventOccurrences(events, 'all', now)) {
    if (checkedEventIds.has(row.event.id)) continue;
    checkedEventIds.add(row.event.id);
    if (row.event.id === countedOnHomeEventId) continue;
    if (isActivityUnseen(row, seen)) newOccurrenceIds.add(row.occurrence_id);
  }
  if (newOccurrenceIds.size === 0) return NOTHING_NEW;
  return { count: newOccurrenceIds.size, newOccurrenceIds };
}
