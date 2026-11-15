/** Names and current photos for people visible in this screen (RAPP-731). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database } from '../types/database';

export interface PersonCard {
  readonly id: string;
  readonly firstName: string | null;
  /** The photo's media object key, or null. */
  readonly avatarKey: string | null;
}

const personCardRowSchema = z.object({
  id: z.uuid(),
  first_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

/** Refresh current photos when an interaction screen is revisited. */
const PERSON_CARDS_STALE_TIME_MS = 30_000;
const EMPTY_CARDS: ReadonlyMap<string, PersonCard> = new Map();

export async function fetchPersonCards(
  client: SupabaseClient<Database>,
  ids: readonly string[],
  signal: AbortSignal,
): Promise<readonly PersonCard[]> {
  const { data, error } = await client
    .rpc('get_person_cards', { p_profile_ids: [...ids] })
    .abortSignal(signal);
  if (error) throw new AppError('DB-1', { message: error.message });
  return z
    .array(personCardRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      firstName: row.first_name,
      avatarKey: row.avatar_url,
    }));
}

/** The distinct, sorted ids, so the same people make the same cache key. */
function personCardIds(ids: readonly (string | null | undefined)[]): readonly string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    .sort()
    .slice(0, 200);
}

export function usePersonCards(
  client: SupabaseClient<Database>,
  userId: string | null,
  ids: readonly (string | null | undefined)[],
): ReadonlyMap<string, PersonCard> {
  const key = useMemo(() => personCardIds(ids), [ids]);
  const query = useQuery({
    queryKey: ['person-cards', userId ?? 'signed-out', key],
    queryFn: ({ signal }) => fetchPersonCards(client, key, signal),
    enabled: userId !== null && key.length > 0,
    staleTime: PERSON_CARDS_STALE_TIME_MS,
  });
  return useMemo(
    () => (query.data ? new Map(query.data.map((card) => [card.id, card])) : EMPTY_CARDS),
    [query.data],
  );
}
