/**
 * What she has already seen on Inici (RAPP-821). The badge on the Inici tab
 * counts what she has not dealt with yet; announcements she has seen and
 * activities she has opened are recorded per person in the database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { Database } from './types/database';

type Client = SupabaseClient<Database>;

const homeSeenResponseSchema = z.object({
  since: z.iso.datetime({ offset: true }),
  announcement_ids: z.array(z.uuid()),
  event_ids: z.array(z.uuid()),
});

export interface HomeSeen {
  /** What was published before this moment counts as seen. */
  readonly since: string;
  readonly announcementIds: readonly string[];
  readonly eventIds: readonly string[];
}

export interface HomeSeenItems {
  readonly announcementIds: readonly string[];
  readonly eventIds: readonly string[];
}

export async function fetchHomeSeen(client: Client, signal?: AbortSignal): Promise<HomeSeen> {
  let query = client.rpc('my_home_seen');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new AppError('DB-1', { message: error.message });
  const parsed = homeSeenResponseSchema.safeParse(data);
  if (!parsed.success) throw new AppError('DB-1', { message: 'unexpected home seen response' });
  return {
    since: parsed.data.since,
    announcementIds: parsed.data.announcement_ids,
    eventIds: parsed.data.event_ids,
  };
}

export async function markHomeItemsSeen(client: Client, items: HomeSeenItems): Promise<void> {
  const { error } = await client.rpc('mark_home_items_seen', {
    p_announcement_ids: z.array(z.uuid()).parse(items.announcementIds),
    p_event_ids: z.array(z.uuid()).parse(items.eventIds),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

/** Adds newly seen items to what is already known, without duplicates. */
export function addHomeSeenItems(current: HomeSeen, items: HomeSeenItems): HomeSeen {
  return {
    since: current.since,
    announcementIds: [...new Set([...current.announcementIds, ...items.announcementIds])],
    eventIds: [...new Set([...current.eventIds, ...items.eventIds])],
  };
}

/**
 * True while she has not dealt with a published item: it was published after
 * her record started and she has not seen it.
 */
export function isUnseenSince(
  publishedAt: string | null,
  itemId: string,
  since: string,
  seenIds: ReadonlySet<string>,
): boolean {
  if (publishedAt === null || seenIds.has(itemId)) return false;
  return new Date(publishedAt).getTime() > new Date(since).getTime();
}
