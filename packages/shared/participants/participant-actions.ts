/**
 * Reading the participant roster (RAPP-23). Shaped like the other shared
 * actions: takes the app's Supabase client, throws a typed `AppError`, and lets
 * the caller's wired `safeAsync` do the logging.
 *
 * The count comes back with the page (`total_count` on every row) rather than
 * from a second round trip, because the pager needs to know how many pages exist
 * before it can render, and a table that says "page 1 of ?" is a table nobody
 * trusts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import {
  buildPrefixTsQuery,
  PARTICIPANT_PAGE_SIZE,
  type ParticipantListRow,
  type ParticipantSearch,
} from './participant-query';

type Client = SupabaseClient<Database>;

export interface ParticipantPage {
  readonly rows: readonly ParticipantListRow[];
  /** Total matching the CURRENT filters, not the size of the organization. */
  readonly total: number;
}

/**
 * One roster page through `list_participants` (RAPP-240). The database decides
 * per caller which fields come back and which filters apply: a caller without
 * participants.view_personal gets the Personal fields empty, and her nationality
 * and dependants filters are ignored rather than answered.
 */
export async function fetchParticipants(
  client: Client,
  search: ParticipantSearch,
): Promise<ParticipantPage> {
  const { data, error } = await client.rpc('list_participants', {
    p_query: buildPrefixTsQuery(search.q),
    p_entity: search.entity ?? undefined,
    p_nationality: search.nationality ?? undefined,
    p_status: search.status,
    p_dependents: search.dependents,
    p_sort: search.sort,
    p_dir: search.dir,
    p_page: search.page,
    p_page_size: PARTICIPANT_PAGE_SIZE,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const rows = (data ?? []).map((row) => {
    const listRow: Partial<typeof row> = { ...row };
    delete listRow.total_count;
    return listRow as unknown as ParticipantListRow;
  });
  return { rows, total: Number(data?.[0]?.total_count ?? 0) };
}

export interface ParticipantFilterOptions {
  readonly entities: readonly string[];
  readonly nationalities: readonly string[];
}

/**
 * The values the filter dropdowns offer, derived from the caller's own roster.
 * Empty arrays are a legitimate answer (a caller who can read no participants
 * learns nothing about the ones that exist), so they are not an error.
 */
export async function fetchParticipantFilterOptions(
  client: Client,
): Promise<ParticipantFilterOptions> {
  const { data, error } = await client.rpc('participant_filter_options');
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  const row = (data ?? [])[0] as { entities: string[]; nationalities: string[] } | undefined;
  return {
    entities: [...(row?.entities ?? [])].sort((a, b) => a.localeCompare(b, 'ca')),
    nationalities: [...(row?.nationalities ?? [])].sort((a, b) => a.localeCompare(b, 'ca')),
  };
}
