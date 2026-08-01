/**
 * Reading the participant roster (RAPP-23). Shaped like the other shared
 * actions: takes the app's Supabase client, throws a typed `AppError`, and lets
 * the caller's wired `safeAsync` do the logging.
 *
 * The count comes back with the page (`count: 'exact'`) rather than from a
 * second round trip, because the pager needs to know how many pages exist
 * before it can render, and a table that says "page 1 of ?" is a table nobody
 * trusts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import {
  applyParticipantQuery,
  PARTICIPANT_LIST_COLUMNS,
  type ParticipantListRow,
  type ParticipantSearch,
} from './participant-query';

type Client = SupabaseClient<Database>;

export interface ParticipantPage {
  readonly rows: readonly ParticipantListRow[];
  /** Total matching the CURRENT filters, not the size of the organization. */
  readonly total: number;
}

export async function fetchParticipants(
  client: Client,
  search: ParticipantSearch,
): Promise<ParticipantPage> {
  const query = client.from('profiles').select(PARTICIPANT_LIST_COLUMNS, { count: 'exact' });
  const { data, error, count } = await applyParticipantQuery(query as never, search);

  if (error) {
    throw new AppError('DB-1', { message: (error as { message: string }).message });
  }
  return { rows: (data ?? []) as ParticipantListRow[], total: count ?? 0 };
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
