/**
 * The participation authorization signed on a staff tablet (RAPP-305).
 *
 * A coach with consents.collect hands the tablet to a player who is already in
 * Ramassà, or to a woman who is not yet (a walk-in, with her first and last
 * name only). Each signing is made on the tablet with its own id and time, and
 * waits in the tablet's offline outbox until it is online. Sending the same id
 * again returns the saved record, so a retry after a lost answer saves nothing
 * twice.
 *
 * A walk-in is not a participant yet: her signing waits, encrypted, in a review
 * queue. A staff member with participants.invite confirms it with an email and
 * a recent second factor (her account is created as for any invitation), merges
 * it into a player who already exists, or discards it.
 *
 * A walk-in also signs the Onboarding signature blocks on the tablet
 * (RAPP-691): they wait with her signing and move to her profile when she is
 * confirmed or merged.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { personNameSchema, trimPersonName } from '../schemas/person-name';
import type { Database, Json } from '../types/database';
import { authorizationContentSchema, type AuthorizationContent } from './authorization';

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** The version a player signs on the tablet: the current season's latest. */
export interface AuthorizationForSigning {
  readonly versionId: string;
  readonly seasonName: string;
  readonly versionNumber: number;
  readonly content: AuthorizationContent;
}

export const authorizationForSigningSchema = z.object({
  versionId: z.uuid(),
  seasonName: z.string(),
  versionNumber: z.number().int(),
  content: authorizationContentSchema,
});

export async function fetchAuthorizationForSigning(
  client: Client,
): Promise<AuthorizationForSigning | null> {
  const { data, error } = await client.rpc('current_authorization_for_signing');
  if (error) throw databaseError(error);
  const row = z
    .array(
      z.object({
        version_id: z.uuid(),
        season_name: z.string(),
        version_number: z.number().int(),
        content: authorizationContentSchema,
      }),
    )
    .max(1)
    .parse(data ?? [])[0];
  if (row === undefined) return null;
  return {
    versionId: row.version_id,
    seasonName: row.season_name,
    versionNumber: row.version_number,
    content: row.content,
  };
}

/** Who signs: a player already in Ramassà, or a walk-in with her name only. */
export type TabletSigner =
  | { readonly kind: 'player'; readonly profileId: string; readonly name: string }
  | { readonly kind: 'walk_in'; readonly firstName: string; readonly lastName: string };

/** Her names follow the same rule as every other name (RAPP-624). */
export const walkInNameSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
});

/** One signing made on the tablet, as it waits in the outbox and as it is sent. */
export interface TabletSigning {
  readonly id: string;
  readonly signer: TabletSigner;
  readonly versionId: string;
  /** The payload built by `buildSignPayload`, with the tablet's language and device. */
  readonly payload: Json;
  readonly signedAt: string;
  /** A walk-in's Onboarding block signatures, `{block: {strokes, language}}` (RAPP-691). */
  readonly blockSignatures?: Json;
  /** A walk-in's ticks of the Onboarding consents, by key (RAPP-699). */
  readonly consents?: Readonly<Record<string, boolean>>;
}

export function signerName(signer: TabletSigner): string {
  return signer.kind === 'player' ? signer.name : `${signer.firstName} ${signer.lastName}`;
}

/** Sends one signing. Returns the id the server saved it under. */
export async function sendTabletSigning(client: Client, signing: TabletSigning): Promise<string> {
  const { data, error } =
    signing.signer.kind === 'player'
      ? await client.rpc('record_staff_device_signature', {
          p_signature_id: signing.id,
          p_profile_id: signing.signer.profileId,
          p_version_id: signing.versionId,
          p_payload: signing.payload,
          p_signed_at: signing.signedAt,
        })
      : await client.rpc('submit_walk_in_signing', {
          p_id: signing.id,
          p_first_name: trimPersonName(signing.signer.firstName),
          p_last_name: trimPersonName(signing.signer.lastName),
          p_version_id: signing.versionId,
          p_payload: signing.payload,
          p_signed_at: signing.signedAt,
          p_block_signatures: signing.blockSignatures ?? {},
          // Sent only when Onboarding asks a consent, so an older server still takes it.
          ...(signing.consents === undefined || Object.keys(signing.consents).length === 0
            ? {}
            : { p_consents: signing.consents }),
        });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

// Review queue (dashboard) ------------------------------------------------------------------

export interface WalkInSigning {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly signedAt: string;
  readonly collectedByName: string;
  readonly createdAt: string;
}

export async function fetchWalkInSignings(client: Client): Promise<readonly WalkInSigning[]> {
  const { data, error } = await client.rpc('list_walk_in_signings');
  if (error) throw databaseError(error);
  return z
    .array(
      z.object({
        id: z.uuid(),
        first_name: z.string(),
        last_name: z.string(),
        signed_at: z.string(),
        collected_by_name: z.string(),
        created_at: z.string(),
      }),
    )
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      signedAt: row.signed_at,
      collectedByName: row.collected_by_name,
      createdAt: row.created_at,
    }));
}

/**
 * Creates her profile and invitation with her signed authorization attached.
 * Needs a recent second factor: wrap the call in the step-up check.
 */
export async function confirmWalkIn(client: Client, id: string, email: string): Promise<string> {
  const { data, error } = await client.rpc('confirm_walk_in', {
    p_id: id,
    p_email: email.trim().toLowerCase(),
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

/** Attaches her signed authorization to a player who is already in Ramassà. */
export async function mergeWalkIn(client: Client, id: string, profileId: string): Promise<void> {
  const { error } = await client.rpc('merge_walk_in', { p_id: id, p_profile_id: profileId });
  if (error) throw databaseError(error);
}

export async function discardWalkIn(client: Client, id: string): Promise<void> {
  const { error } = await client.rpc('discard_walk_in', { p_id: id });
  if (error) throw databaseError(error);
}
