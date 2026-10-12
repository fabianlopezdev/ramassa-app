/**
 * Goods received (RAPP-250): arrivals into stock, and the stock they make.
 * An arrival needs a connection, but the phone still makes its id, so a save
 * retried after a lost answer saves nothing twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

export const ARRIVAL_SOURCES = ['donation', 'purchase', 'sponsor'] as const;
export type ArrivalSource = (typeof ARRIVAL_SOURCES)[number];

export const ARRIVAL_PHOTO_KINDS = ['goods', 'receipt'] as const;
export type ArrivalPhotoKind = (typeof ARRIVAL_PHOTO_KINDS)[number];

export const ARRIVAL_MAX_PHOTOS = 10;
export const ARRIVAL_MAX_QUANTITY = 10_000;

export interface ArrivalLineInput {
  readonly itemTypeId: string;
  readonly size: string | null;
  readonly quantity: number;
  /** Null on a donation takes the item type's default value. */
  readonly unitValueCents: number | null;
}

export interface ArrivalInput {
  readonly id: string;
  readonly receivedAt: string;
  readonly source: ArrivalSource;
  readonly sourceName: string;
  readonly problems: string;
  readonly totalCostCents: number | null;
  readonly lines: readonly ArrivalLineInput[];
  readonly photos: readonly { readonly objectKey: string; readonly kind: ArrivalPhotoKind }[];
}

export interface StockLevel {
  readonly itemKey: string;
  readonly size: string | null;
  readonly quantity: number;
}

export interface ArrivalSummary {
  readonly id: string;
  readonly receivedAt: string;
  readonly source: ArrivalSource;
  readonly sourceName: string | null;
  readonly problems: string | null;
  readonly totalCostCents: number | null;
  readonly lines: readonly {
    readonly itemKey: string;
    readonly size: string | null;
    readonly quantity: number;
  }[];
  readonly photos: readonly { readonly objectKey: string; readonly kind: ArrivalPhotoKind }[];
}

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

export async function recordEquipmentArrival(client: Client, input: ArrivalInput): Promise<string> {
  const { data, error } = await client.rpc('record_equipment_arrival', {
    p_id: input.id,
    p_received_at: input.receivedAt,
    p_source: input.source,
    p_source_name: input.sourceName.trim() === '' ? undefined : input.sourceName.trim(),
    p_problems: input.problems.trim() === '' ? undefined : input.problems.trim(),
    p_total_cost_cents:
      input.source === 'purchase' && input.totalCostCents !== null
        ? input.totalCostCents
        : undefined,
    p_lines: input.lines.map((line) => ({
      item_type_id: line.itemTypeId,
      size: line.size,
      quantity: line.quantity,
      unit_value_cents: line.unitValueCents,
    })),
    p_photos: input.photos.map((photo) => ({ object_key: photo.objectKey, kind: photo.kind })),
  });
  if (error) throw databaseError(error);
  return data;
}

/** Stock by item and size, the sum of the ledger. A size appears once it has a movement. */
export async function fetchStockLevels(client: Client): Promise<readonly StockLevel[]> {
  const { data, error } = await client.rpc('stock_levels');
  if (error) throw databaseError(error);
  return (data ?? []).map((row) => ({
    itemKey: row.item_key,
    size: row.size,
    quantity: row.quantity,
  }));
}

const RECENT_ARRIVALS = 20;

export async function fetchRecentArrivals(client: Client): Promise<readonly ArrivalSummary[]> {
  const { data, error } = await client
    .from('equipment_arrivals')
    .select(
      'id, received_at, source, source_name, problems, total_cost_cents, ' +
        'lines:stock_movements(size, quantity, item_type:equipment_item_types!inner(key)), ' +
        'photos:equipment_arrival_photos(object_key, kind)',
    )
    .order('received_at', { ascending: false })
    .limit(RECENT_ARRIVALS);
  if (error) throw databaseError(error);
  const rows = (data ?? []) as unknown as readonly {
    readonly id: string;
    readonly received_at: string;
    readonly source: ArrivalSource;
    readonly source_name: string | null;
    readonly problems: string | null;
    readonly total_cost_cents: number | null;
    readonly lines: readonly {
      readonly size: string | null;
      readonly quantity: number;
      readonly item_type: { readonly key: string };
    }[];
    readonly photos: readonly { readonly object_key: string; readonly kind: ArrivalPhotoKind }[];
  }[];
  return rows.map((row) => ({
    id: row.id,
    receivedAt: row.received_at,
    source: row.source,
    sourceName: row.source_name,
    problems: row.problems,
    totalCostCents: row.total_cost_cents,
    lines: row.lines.map((line) => ({
      itemKey: line.item_type.key,
      size: line.size,
      quantity: line.quantity,
    })),
    photos: row.photos.map((photo) => ({ objectKey: photo.object_key, kind: photo.kind })),
  }));
}

/**
 * A price typed by a person, in euros: "12", "12,5", "12.50", "1.234,50".
 * Null when it is not a price, so the form can say so before saving.
 */
export function parseEuroCents(text: string): number | null {
  const trimmed = text.trim().replace(/\s|€/g, '');
  if (trimmed === '') return null;
  // A comma is the decimal mark here; a dot before three digits is thousands.
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, '')
      : trimmed;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Cents as the text a person would type back: 1250 -> "12,50". */
export function centsToEuroText(cents: number | null): string {
  if (cents === null) return '';
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
}
