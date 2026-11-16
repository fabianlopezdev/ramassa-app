/**
 * The activity Inici shows (RAPP-790): her next one she signed up for, else
 * the next upcoming activity open to her. Same visibility rules as the
 * Activitats list.
 */

import { filterPlayerEventOccurrences, type PlayerEventOccurrence } from '@ramassa/shared/events';

function isHerSignup(row: PlayerEventOccurrence): boolean {
  return row.signup?.state === 'confirmed' || row.signup?.state === 'interested';
}

export function pickNextPlayerActivity(
  rows: readonly PlayerEventOccurrence[] | undefined,
  now: Date = new Date(),
): PlayerEventOccurrence | null {
  const upcoming = filterPlayerEventOccurrences(rows ?? [], 'all', now);
  return upcoming.find(isHerSignup) ?? upcoming[0] ?? null;
}
