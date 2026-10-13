/**
 * Staff checkout and check-in (RAPP-252): material lent to a staff member for
 * longer than a session, and what came back. Run by the storeroom
 * (`equipment.receive` or `equipment.count`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';
import type { ReturnCondition } from './handover';

type Client = SupabaseClient<Database>;

export interface CheckoutRecipient {
  readonly id: string;
  readonly name: string;
}

export interface OpenCheckout {
  readonly id: string;
  readonly itemKey: string;
  readonly size: string | null;
  readonly quantity: number;
  readonly staffId: string | null;
  readonly staffName: string;
  readonly checkedOutAt: string;
  readonly expectedReturnOn: string;
  readonly note: string | null;
  readonly isOverdue: boolean;
}

/** The return dates offered: tomorrow, a few days, one or two weeks. */
export const RETURN_IN_DAYS = [1, 3, 7, 14] as const;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

const fullName = (first: string | null, last: string | null) =>
  [first, last].filter((part) => part !== null && part !== '').join(' ');

export async function fetchCheckoutRecipients(
  client: Client,
): Promise<readonly CheckoutRecipient[]> {
  const { data, error } = await client.rpc('checkout_recipients');
  if (error) throw databaseError(error);
  return (data ?? []).map((row) => ({
    id: row.profile_id,
    name: fullName(row.first_name, row.last_name),
  }));
}

export async function fetchOpenCheckouts(client: Client): Promise<readonly OpenCheckout[]> {
  const { data, error } = await client.rpc('open_staff_checkouts');
  if (error) throw databaseError(error);
  return (data ?? []).map((row) => ({
    id: row.checkout_id,
    itemKey: row.item_key,
    size: row.size,
    quantity: row.quantity,
    staffId: row.staff_id,
    staffName: fullName(row.staff_first_name, row.staff_last_name),
    checkedOutAt: row.checked_out_at,
    expectedReturnOn: row.expected_return_on,
    note: row.note,
    isOverdue: row.is_overdue,
  }));
}

export async function recordStaffCheckout(
  client: Client,
  input: {
    readonly id: string;
    readonly itemTypeId: string;
    readonly size: string | null;
    readonly quantity: number;
    readonly staffId: string;
    readonly expectedReturnOn: string;
    readonly note: string;
  },
): Promise<void> {
  const { error } = await client.rpc('record_staff_checkout', {
    p_id: input.id,
    p_item_type_id: input.itemTypeId,
    // Sizeless items send null; the generated type cannot say so.
    p_size: input.size as string,
    p_quantity: input.quantity,
    p_staff_id: input.staffId,
    p_expected_return_on: input.expectedReturnOn,
    p_note: input.note.trim() === '' ? undefined : input.note.trim(),
  });
  if (error) throw databaseError(error);
}

export async function recordStaffCheckin(
  client: Client,
  input: {
    readonly checkoutId: string;
    readonly returned: number;
    readonly condition: ReturnCondition | null;
  },
): Promise<void> {
  const { error } = await client.rpc('record_staff_checkin', {
    p_checkout_id: input.checkoutId,
    p_returned: input.returned,
    p_condition: input.returned > 0 && input.condition !== null ? input.condition : undefined,
  });
  if (error) throw databaseError(error);
}

/**
 * A calendar date some days after `from`, in Madrid, as YYYY-MM-DD. Built
 * from the Madrid calendar date so a late evening never lands a day off.
 */
export function returnDateIn(days: number, from: Date = new Date()): string {
  const madrid = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(from);
  const [year, month, day] = madrid.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
