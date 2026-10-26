/**
 * Her names as the signed-in reader may see them (RAPP-693).
 *
 * Her names are answers with a privacy level, like every field. The
 * `first_name` and `last_name` columns of `profiles` hold a copy at the Normal
 * level only: a Personal or Sensitive name reads there as her number. A screen
 * that reads players from the table lays the database's display rule over
 * them (`public.shown_names`): her name where the reader may read it,
 * "Jugadora 0042" in the reader's language where not.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

const shownNameSchema = z.object({
  id: z.uuid(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
});

export async function withShownNames<
  Row extends { readonly id: string; readonly first_name: string; readonly last_name: string },
>(client: Pick<Client, 'rpc'>, rows: readonly Row[], signal?: AbortSignal): Promise<Row[]> {
  if (rows.length === 0) return [];
  let query = client.rpc('shown_names', { p_ids: rows.map((row) => row.id) });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new AppError('DB-1', { message: error.message });
  const shown = new Map(
    z
      .array(shownNameSchema)
      .parse(data ?? [])
      .map((row) => [row.id, row]),
  );
  return rows.map((row) => {
    const names = shown.get(row.id);
    return names === undefined
      ? row
      : { ...row, first_name: names.first_name ?? '', last_name: names.last_name ?? '' };
  });
}
