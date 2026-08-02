/**
 * The equipment delivery log (RAPP-27), shaped like the other shared actions:
 * takes the app's Supabase client, throws a typed `AppError`, and lets the
 * caller's wired `safeAsync` log it.
 *
 * Staff-only by RLS, so there is no player-side twin of this file and there
 * should not be one: the log is the programme's operational record, and a
 * second read path onto it would be a second thing to keep safe for no gain.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import type { EquipmentDeliveryInput } from '../schemas/equipment';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

export type EquipmentDeliveryRow = Database['public']['Tables']['equipment_deliveries']['Row'];

export const EQUIPMENT_DELIVERY_COLUMNS =
  'id, profile_id, item, size, delivered_on, delivered_by, note, created_at';

/**
 * One participant's deliveries, newest first. Ordered in the database rather
 * than in the browser so it stays right when a long-standing participant's log
 * outgrows one screen.
 *
 * Tie-broken by `created_at`: `delivered_on` is a DATE, so two items handed over
 * on the same day would otherwise come back in whatever order the planner felt
 * like, and a list that reshuffles between reloads reads as a bug.
 */
export async function fetchEquipmentDeliveries(
  client: Client,
  participantId: string,
): Promise<readonly EquipmentDeliveryRow[]> {
  const { data, error } = await client
    .from('equipment_deliveries')
    .select(EQUIPMENT_DELIVERY_COLUMNS)
    .eq('profile_id', participantId)
    .order('delivered_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return (data ?? []) as unknown as EquipmentDeliveryRow[];
}

export interface AddEquipmentDeliveryParams {
  readonly participantId: string;
  /** The signed-in staff member. The RLS policy checks it; the column has no default. */
  readonly deliveredBy: string;
  readonly delivery: EquipmentDeliveryInput;
}

export async function addEquipmentDelivery(
  client: Client,
  params: AddEquipmentDeliveryParams,
): Promise<void> {
  const { error } = await client.from('equipment_deliveries').insert({
    profile_id: params.participantId,
    delivered_by: params.deliveredBy,
    item: params.delivery.item,
    // An item with no size stores NULL, never an empty string: the report groups
    // on this column and '' would be a size nobody wears.
    size:
      params.delivery.size === undefined || params.delivery.size === ''
        ? null
        : params.delivery.size,
    delivered_on: params.delivery.deliveredOn,
    note:
      params.delivery.note === undefined || params.delivery.note === ''
        ? null
        : params.delivery.note,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
}

/**
 * How many of each item went out, for the season report this catalog exists to
 * make answerable. Computed here rather than in SQL because the admin already
 * has the rows on screen, and a second query for a number the page can add up
 * is a round trip that can disagree with what the reader is looking at.
 */
export function countDeliveriesByItem(
  deliveries: readonly EquipmentDeliveryRow[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const delivery of deliveries) {
    counts.set(delivery.item, (counts.get(delivery.item) ?? 0) + 1);
  }
  return counts;
}
