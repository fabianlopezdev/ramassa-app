/**
 * Handover with signature and returns (RAPP-249): the phone side of the
 * material ledger. A handover goes through `record_equipment_handover`, which
 * the offline outbox may send more than once: the phone makes the record's id,
 * and the server returns the saved record when it sees the id again.
 *
 * Her signature is the strokes of her finger, scaled to 0..1000 on both axes,
 * so it draws the same on any screen. It is stored on the handover record, so
 * erasing her deletes it with the record.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/** The pad's coordinate range on both axes. */
export const SIGNATURE_SCALE = 1000;
/** Far more than a signature needs; keeps the stored record small. */
export const SIGNATURE_MAX_POINTS = 4000;

const signaturePointSchema = z.tuple([
  z.number().int().min(0).max(SIGNATURE_SCALE),
  z.number().int().min(0).max(SIGNATURE_SCALE),
]);

export const signatureStrokesSchema = z
  .array(z.array(signaturePointSchema).min(1))
  .min(1)
  .refine(
    (strokes) =>
      strokes.reduce((total, stroke) => total + stroke.length, 0) <= SIGNATURE_MAX_POINTS,
  );

export type SignatureStrokes = z.infer<typeof signatureStrokesSchema>;

export const HANDOVER_MODES = ['given', 'lent'] as const;
export type HandoverMode = (typeof HANDOVER_MODES)[number];

export const UNSIGNED_STATES = ['refused', 'unable'] as const;
export type UnsignedState = (typeof UNSIGNED_STATES)[number];

export const RETURN_CONDITIONS = ['new', 'good', 'worn', 'unusable'] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

/** The languages a statement can be shown in: the player-side languages. */
export const STATEMENT_LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;
export type StatementLanguage = (typeof STATEMENT_LANGUAGES)[number];

export type HandoverSignature =
  | { readonly state: 'signed'; readonly strokes: SignatureStrokes }
  | { readonly state: UnsignedState; readonly reason: string };

export interface HandoverInput {
  readonly id: string;
  readonly handedOverAt: string;
  readonly participantId: string;
  readonly itemTypeId: string;
  readonly size: string | null;
  readonly mode: HandoverMode;
  readonly signature: HandoverSignature;
  readonly statementLanguage: StatementLanguage;
}

export interface HandoverResult {
  readonly deliveryId: string;
  readonly unitCode: string | null;
  readonly stockAfter: number;
}

export interface HandoverItemType {
  readonly id: string;
  readonly key: string;
  readonly kind: 'player_kit' | 'team_equipment';
  readonly sizes: readonly string[];
}

export interface ParticipantMaterialRow {
  readonly deliveryId: string;
  readonly itemKey: string;
  readonly size: string | null;
  readonly mode: HandoverMode;
  readonly unitCode: string | null;
  readonly deliveredOn: string;
  readonly signatureState: 'signed' | 'refused' | 'unable' | 'not_collected';
  readonly returnedAt: string | null;
  readonly returnCondition: ReturnCondition | null;
}

export interface StockAlert {
  readonly id: string;
  readonly itemKey: string;
  readonly size: string | null;
  readonly openedAt: string;
}

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  // A refusal keeps its own code, so the offline outbox shows it (RAPP-237).
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** The active item types, in a stable order for the picker. */
export async function fetchHandoverItemTypes(client: Client): Promise<readonly HandoverItemType[]> {
  const { data, error } = await client
    .from('equipment_item_types')
    .select('id, key, kind, sizes')
    .eq('is_active', true)
    .order('key');
  if (error) throw databaseError(error);
  return (data ?? []) as readonly HandoverItemType[];
}

export async function recordEquipmentHandover(
  client: Client,
  input: HandoverInput,
): Promise<HandoverResult> {
  const signature = input.signature;
  const { data, error } = await client.rpc('record_equipment_handover', {
    p_id: input.id,
    p_handed_over_at: input.handedOverAt,
    p_participant_id: input.participantId,
    p_item_type_id: input.itemTypeId,
    // Sizeless items send null; the generated type cannot say a parameter
    // without a default accepts null.
    p_size: input.size as string,
    p_mode: input.mode,
    p_signature_state: signature.state,
    p_signature: signature.state === 'signed' ? signature.strokes : undefined,
    p_signature_reason: signature.state === 'signed' ? undefined : signature.reason.trim(),
    p_statement_language: input.statementLanguage,
  });
  if (error) throw databaseError(error);
  const row = data?.[0];
  if (row === undefined)
    throw new AppError('DB-1', { message: 'record_equipment_handover: no row' });
  return { deliveryId: row.delivery_id, unitCode: row.unit_code, stockAfter: row.stock_after };
}

export async function recordEquipmentReturn(
  client: Client,
  input: { readonly deliveryId: string; readonly condition: ReturnCondition },
): Promise<void> {
  const { error } = await client.rpc('record_equipment_return', {
    p_delivery_id: input.deliveryId,
    p_condition: input.condition,
  });
  if (error) throw databaseError(error);
}

export async function fetchParticipantMaterial(
  client: Client,
  participantId: string,
): Promise<readonly ParticipantMaterialRow[]> {
  const { data, error } = await client.rpc('participant_material', {
    p_participant_id: participantId,
  });
  if (error) throw databaseError(error);
  return (data ?? []).map((row) => ({
    deliveryId: row.delivery_id,
    itemKey: row.item_key,
    size: row.size,
    mode: row.mode as HandoverMode,
    unitCode: row.unit_code,
    deliveredOn: row.delivered_on,
    signatureState: row.signature_state as ParticipantMaterialRow['signatureState'],
    returnedAt: row.returned_at,
    returnCondition: row.return_condition as ReturnCondition | null,
  }));
}

/** A lent item that has not come back is the only one with a return to record. */
export function awaitsReturn(row: ParticipantMaterialRow): boolean {
  return row.mode === 'lent' && row.returnedAt === null;
}

export async function fetchOpenStockAlerts(client: Client): Promise<readonly StockAlert[]> {
  const { data, error } = await client
    .from('stock_alerts')
    .select('id, size, opened_at, item_type:equipment_item_types!inner(key)')
    .is('resolved_at', null)
    .order('opened_at', { ascending: false });
  if (error) throw databaseError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    itemKey: row.item_type.key,
    size: row.size,
    openedAt: row.opened_at,
  }));
}
