/**
 * What on Inici she has not dealt with yet (RAPP-821). The number on the Inici
 * tab and the blocks on the screen are both built here, so the badge always
 * matches what she finds when she opens the tab.
 *
 * - Per fer: counts until she completes or puts off the form or survey.
 * - Avisos: an announcement counts until she opens it (RAPP-848).
 * - Propera activitat: a new activity says "Nou" until she opens it or signs
 *   up. It adds to the number only until she has seen Inici (RAPP-873).
 */

import { pickNextPlayerActivity } from '@/lib/home-next-activity';
import { buildHomeToDoQueue, type HomeToDoItem } from '@/lib/home-to-do';
import {
  filterAndOrderPlayerAnnouncements,
  type AnnouncementListRow,
} from '@ramassa/shared/announcements';
import type { PlayerEventOccurrence } from '@ramassa/shared/events';
import { isUnseenSince, type HomeSeen } from '@ramassa/shared/home-seen';
import type { MySurvey, PendingCustomForm } from '@ramassa/shared/intake-builder';
import type { PlayerSurvey } from '@ramassa/shared/surveys';

export interface HomeAttentionSources {
  readonly forms: readonly PendingCustomForm[] | undefined;
  readonly surveys: readonly PlayerSurvey[] | undefined;
  /** Her surveys on the form engine (RAPP-929); an older caller sends none. */
  readonly surveyForms?: readonly MySurvey[] | undefined;
  readonly events: readonly PlayerEventOccurrence[] | undefined;
  readonly announcements: readonly AnnouncementListRow[] | undefined;
  /** Not loaded yet: nothing is shown as unseen, so no number flashes and goes. */
  readonly seen: HomeSeen | undefined;
  /**
   * When she last saw Inici (RAPP-873): `null` is never, `undefined` is not
   * loaded yet, and then the next activity adds nothing to the number.
   */
  readonly homeSeenAt: string | null | undefined;
}

export interface HomeAttention {
  readonly toDoItems: readonly HomeToDoItem[];
  readonly nextActivity: PlayerEventOccurrence | null;
  readonly isNextActivityUnseen: boolean;
  /** The next activity adds 1 to the number: new, and published after she last saw Inici. */
  readonly isNextActivityCounted: boolean;
  readonly unseenAnnouncementIds: ReadonlySet<string>;
  /** The number on the Inici tab. */
  readonly count: number;
}

const NO_IDS: ReadonlySet<string> = new Set();

function unseenAnnouncements(
  announcements: readonly AnnouncementListRow[] | undefined,
  seen: HomeSeen | undefined,
  now: Date,
): ReadonlySet<string> {
  if (seen === undefined || announcements === undefined) return NO_IDS;
  const seenIds = new Set(seen.announcementIds);
  const unseen = filterAndOrderPlayerAnnouncements(announcements, 'all', now)
    .filter((row) => isUnseenSince(row.published_at, row.id, seen.since, seenIds))
    .map((row) => row.id);
  return unseen.length === 0 ? NO_IDS : new Set(unseen);
}

export function isActivityUnseen(
  occurrence: PlayerEventOccurrence | null,
  seen: HomeSeen | undefined,
): boolean {
  if (occurrence === null || seen === undefined) return false;
  // Any answer of hers, a sign-up or a cancelled one, means she has dealt with it.
  if (occurrence.signup !== null) return false;
  return isUnseenSince(
    occurrence.event.published_at,
    occurrence.event.id,
    seen.since,
    new Set(seen.eventIds),
  );
}

/**
 * True while a list she last saw at `listSeenAt` has not shown this thing yet
 * (RAPP-873): `null` means she has never seen the list, `undefined` that the
 * moment has not loaded, which counts nothing so no number flashes and goes.
 */
export function isPublishedAfterListSeen(
  publishedAt: string | null,
  listSeenAt: string | null | undefined,
): boolean {
  if (listSeenAt === undefined || publishedAt === null) return false;
  if (listSeenAt === null) return true;
  return new Date(publishedAt).getTime() > new Date(listSeenAt).getTime();
}

export function buildHomeAttention(
  sources: HomeAttentionSources,
  now: Date = new Date(),
): HomeAttention {
  const toDoItems = buildHomeToDoQueue(sources.forms, sources.surveys, sources.surveyForms);
  const nextActivity = pickNextPlayerActivity(sources.events, now);
  const isNextActivityUnseen = isActivityUnseen(nextActivity, sources.seen);
  const isNextActivityCounted =
    isNextActivityUnseen &&
    isPublishedAfterListSeen(nextActivity?.event.published_at ?? null, sources.homeSeenAt);
  const unseenAnnouncementIds = unseenAnnouncements(sources.announcements, sources.seen, now);
  return {
    toDoItems,
    nextActivity,
    isNextActivityUnseen,
    isNextActivityCounted,
    unseenAnnouncementIds,
    count: toDoItems.length + unseenAnnouncementIds.size + (isNextActivityCounted ? 1 : 0),
  };
}
