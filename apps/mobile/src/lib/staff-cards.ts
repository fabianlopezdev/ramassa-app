/**
 * The team's first name and photo for the people a screen shows (RAPP-639):
 * chat senders, forum authors and article authors. One call per screen for
 * the distinct ids, cached by React Query, so a list never asks per row.
 *
 * `get_staff_cards` answers only for staff and admins of her organization:
 * any other id (a player, another organization) simply has no card, and the
 * screen keeps the name it already had.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { z } from 'zod';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import { supabase } from './supabase';

export interface StaffCard {
  readonly id: string;
  readonly firstName: string | null;
  /** The photo's media object key, or null. */
  readonly avatarKey: string | null;
}

const staffCardRowSchema = z.object({
  id: z.uuid(),
  first_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

/** A team photo rarely changes; ten minutes keeps a chat quiet. */
const STAFF_CARDS_STALE_TIME_MS = 10 * 60_000;
const EMPTY_CARDS: ReadonlyMap<string, StaffCard> = new Map();

async function fetchStaffCards(
  ids: readonly string[],
  signal: AbortSignal,
): Promise<ReadonlyMap<string, StaffCard>> {
  const { data, error } = await supabase
    .rpc('get_staff_cards', { p_profile_ids: [...ids] })
    .abortSignal(signal);
  if (error) throw new AppError('DB-1', { message: error.message });
  const cards = new Map<string, StaffCard>();
  for (const row of z.array(staffCardRowSchema).parse(data ?? [])) {
    cards.set(row.id, { id: row.id, firstName: row.first_name, avatarKey: row.avatar_url });
  }
  return cards;
}

/** The distinct, sorted ids, so the same people make the same cache key. */
function staffCardIds(ids: readonly (string | null | undefined)[]): readonly string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    .sort()
    .slice(0, 200);
}

export function useStaffCards(
  ids: readonly (string | null | undefined)[],
): ReadonlyMap<string, StaffCard> {
  const { user } = useAuth();
  const key = useMemo(() => staffCardIds(ids), [ids]);
  const query = useQuery({
    queryKey: ['staff-cards', user?.id ?? 'signed-out', key],
    queryFn: ({ signal }) => fetchStaffCards(key, signal),
    enabled: user !== null && key.length > 0,
    staleTime: STAFF_CARDS_STALE_TIME_MS,
    // A new sender keeps the cards already shown while the next set loads.
    placeholderData: keepPreviousData,
  });
  return query.data ?? EMPTY_CARDS;
}
