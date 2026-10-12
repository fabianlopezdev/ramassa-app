/**
 * Stock counts and corrections (RAPP-251): what was on the shelf for one item,
 * size by size. Where it differs from the ledger, the database writes a
 * correction with the reason chosen here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

export const COUNT_REASONS = [
  'lost',
  'damaged',
  'found',
  'earlier_miscount',
  'unrecorded_handover',
  'other',
] as const;
export type CountReason = (typeof COUNT_REASONS)[number];

export interface CountLine {
  readonly size: string | null;
  readonly counted: number;
}

export interface CountDifference {
  readonly size: string | null;
  readonly expected: number;
  readonly counted: number;
}

export interface MonthlyCount {
  readonly itemTypeId: string;
  readonly itemKey: string;
}

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

export async function recordStockCount(
  client: Client,
  input: {
    readonly id: string;
    readonly itemTypeId: string;
    readonly lines: readonly CountLine[];
    readonly reason: CountReason | null;
    readonly note: string;
  },
): Promise<{ readonly corrections: number }> {
  const { data, error } = await client.rpc('record_stock_count', {
    p_id: input.id,
    p_item_type_id: input.itemTypeId,
    p_lines: input.lines.map((line) => ({ size: line.size, counted: line.counted })),
    p_reason: input.reason ?? undefined,
    p_note: input.note.trim() === '' ? undefined : input.note.trim(),
  });
  if (error) throw databaseError(error);
  return { corrections: data?.[0]?.corrections ?? 0 };
}

/** The item Today asks to count this month, or null when this month's count is done. */
export async function fetchMonthlyCount(client: Client): Promise<MonthlyCount | null> {
  const { data, error } = await client.rpc('monthly_stock_count');
  if (error) throw databaseError(error);
  const row = data?.[0];
  return row === undefined ? null : { itemTypeId: row.item_type_id, itemKey: row.item_key };
}

/**
 * The sizes where the shelf and the ledger disagree, given the ledger's
 * stock by size (a size with no movement is 0).
 */
export function countDifferences(
  lines: readonly CountLine[],
  expectedBySize: ReadonlyMap<string | null, number>,
): readonly CountDifference[] {
  return lines
    .map((line) => ({
      size: line.size,
      expected: expectedBySize.get(line.size) ?? 0,
      counted: line.counted,
    }))
    .filter((line) => line.expected !== line.counted);
}
