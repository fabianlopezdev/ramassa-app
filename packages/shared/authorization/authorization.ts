/**
 * Ramassà's participation authorization, signed in the app (RAPP-304).
 *
 * Staff publish a version per season (Settings). Every player signs the latest
 * version of the current season, or has a paper record for that season; until
 * then her app shows only the authorization screen. She ticks each consent,
 * gives the medical answer and draws her signature, or signs with the ticks
 * alone when she cannot draw, and the record says so.
 *
 * The consents are a fixed vocabulary, so a required one can never become
 * optional by mistake. Staff write their wording.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { signatureStrokesSchema, type SignatureStrokes } from '../equipment/handover';
import { AppError, databaseErrorCode } from '../errors';
import { withCancellation, type CancellableRequest } from '../lib/cancellation';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';

type Client = SupabaseClient<Database>;

/** The consents in signing order, with the flag the database enforces. */
export const AUTHORIZATION_CONSENTS = [
  { key: 'participation', required: true },
  { key: 'data_processing', required: true },
  { key: 'code_of_conduct', required: true },
  { key: 'health_data', required: true },
  { key: 'image_rights', required: false },
  { key: 'newsletter', required: false },
  { key: 'messaging_groups', required: false },
] as const;

export type AuthorizationConsentKey = (typeof AUTHORIZATION_CONSENTS)[number]['key'];

export const OPTIONAL_CONSENT_KEYS = AUTHORIZATION_CONSENTS.filter(
  (consent) => !consent.required,
).map((consent) => consent.key);

const CONSENT_KEYS = AUTHORIZATION_CONSENTS.map((consent) => consent.key) as [
  AuthorizationConsentKey,
  ...AuthorizationConsentKey[],
];

/** Text in any of the five languages; at least one is given. */
export const authorizationTextSchema = z
  .object({
    ca: z.string().optional(),
    es: z.string().optional(),
    en: z.string().optional(),
    ar: z.string().optional(),
    fa: z.string().optional(),
  })
  .refine((text) => Object.values(text).some((value) => (value ?? '').trim() !== ''));

export type AuthorizationText = z.infer<typeof authorizationTextSchema>;

const consentSchema = z.object({ required: z.boolean(), label: authorizationTextSchema });

export const authorizationContentSchema = z.object({
  title: authorizationTextSchema,
  sections: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z_]{1,40}$/),
        title: authorizationTextSchema,
        body: authorizationTextSchema,
      }),
    )
    .min(1)
    .max(20),
  consents: z.object(
    Object.fromEntries(CONSENT_KEYS.map((key) => [key, consentSchema])) as Record<
      AuthorizationConsentKey,
      typeof consentSchema
    >,
  ),
  attachments: z
    .array(z.object({ label: authorizationTextSchema, url: z.url().startsWith('https://') }))
    .max(10)
    .default([]),
});

export type AuthorizationContent = z.infer<typeof authorizationContentSchema>;

const statusRowSchema = z.object({
  required: z.boolean(),
  version_id: z.uuid(),
  season_id: z.uuid(),
  season_name: z.string(),
  version_number: z.number().int(),
  content: authorizationContentSchema,
  // Returning: she signed an earlier season (RAPP-306). Older servers omit it.
  is_returning: z.boolean().optional().default(false),
});

export interface AuthorizationStatus {
  readonly required: boolean;
  readonly versionId: string;
  readonly seasonId: string;
  readonly seasonName: string;
  readonly versionNumber: number;
  readonly content: AuthorizationContent;
  /** She signed an earlier season: this is re-registration (RAPP-306). */
  readonly isReturning: boolean;
}

/**
 * What she must sign, or null when her organization has published nothing for
 * the current season. Only a player is ever required to sign.
 */
export async function fetchMyAuthorizationStatus(
  client: Client,
  options: CancellableRequest = {},
): Promise<AuthorizationStatus | null> {
  const { data, error } = await withCancellation(client.rpc('my_authorization_status'), options);
  if (error) throw new AppError('DB-1', { message: error.message });
  const row = z
    .array(statusRowSchema)
    .max(1)
    .parse(data ?? [])[0];
  if (row === undefined) return null;
  return {
    required: row.required,
    versionId: row.version_id,
    seasonId: row.season_id,
    seasonName: row.season_name,
    versionNumber: row.version_number,
    content: row.content,
    isReturning: row.is_returning,
  };
}

/** The gate: she sees only the authorization screen until she signs. */
export function needsAuthorization(status: AuthorizationStatus | null): boolean {
  return status?.required === true;
}

/** What she gives when she signs, checked before it is sent. */
export const authorizationSigningSchema = z
  .object({
    consents: z.record(z.enum(CONSENT_KEYS), z.boolean()),
    healthInfo: z.string().trim().min(1).max(4000),
    emergencyContact: z
      .object({
        name: z.string().trim().max(200),
        relation: z.string().trim().max(100),
        phone: z.string().trim().max(50),
      })
      .optional(),
    strokes: signatureStrokesSchema.nullable(),
    unableToDraw: z.boolean(),
  })
  .superRefine((signing, context) => {
    for (const consent of AUTHORIZATION_CONSENTS) {
      if (consent.required && signing.consents[consent.key] !== true) {
        context.addIssue({ code: 'custom', path: ['consents', consent.key], message: 'required' });
      }
    }
    const hasDrawing = signing.strokes !== null && signing.strokes.length > 0;
    if (hasDrawing === signing.unableToDraw) {
      context.addIssue({ code: 'custom', path: ['strokes'], message: 'draw or say you cannot' });
    }
  });

export type AuthorizationSigning = z.infer<typeof authorizationSigningSchema>;

export function buildSignPayload(
  signing: AuthorizationSigning,
  context: { readonly language: LanguageCode; readonly device: string | null },
): Json {
  return {
    consents: Object.fromEntries(
      AUTHORIZATION_CONSENTS.map(({ key }) => [key, signing.consents[key] === true]),
    ),
    health_info: signing.healthInfo,
    emergency_contact: signing.emergencyContact ?? null,
    signature: signing.unableToDraw ? null : ((signing.strokes as Json | null) ?? null),
    unable_to_draw: signing.unableToDraw,
    language: context.language,
    device: context.device,
  };
}

export async function signAuthorization(
  client: Client,
  versionId: string,
  signing: AuthorizationSigning,
  context: { readonly language: LanguageCode; readonly device: string | null },
): Promise<void> {
  const { error } = await client.rpc('sign_authorization', {
    p_version_id: versionId,
    p_payload: buildSignPayload(signing, context),
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
}

/** Her optional consents as they stand; a consent never given reads as false. */
export async function fetchMyConsents(
  client: Client,
): Promise<Readonly<Partial<Record<AuthorizationConsentKey, boolean>>>> {
  const { data, error } = await client.rpc('my_consents');
  if (error) throw new AppError('DB-1', { message: error.message });
  const rows = z
    .array(z.object({ consent_key: z.string(), granted: z.boolean() }))
    .parse(data ?? []);
  return Object.fromEntries(
    rows
      .filter((row) => (CONSENT_KEYS as string[]).includes(row.consent_key))
      .map((row) => [row.consent_key, row.granted]),
  );
}

export async function setOptionalConsent(
  client: Client,
  key: AuthorizationConsentKey,
  granted: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_optional_consent', { p_key: key, p_granted: granted });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
}

// Staff ---------------------------------------------------------------------------------------

const versionRowSchema = z.object({
  id: z.uuid(),
  season_id: z.uuid(),
  season_name: z.string(),
  version_number: z.number().int(),
  content: authorizationContentSchema,
  published_at: z.string(),
  is_current: z.boolean(),
});

export interface AuthorizationVersion {
  readonly id: string;
  readonly seasonName: string;
  readonly versionNumber: number;
  readonly content: AuthorizationContent;
  readonly publishedAt: string;
  readonly isCurrent: boolean;
}

export async function fetchAuthorizationVersions(
  client: Client,
): Promise<readonly AuthorizationVersion[]> {
  const { data, error } = await client.rpc('list_authorization_versions');
  if (error) throw new AppError('DB-1', { message: error.message });
  return z
    .array(versionRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      seasonName: row.season_name,
      versionNumber: row.version_number,
      content: row.content,
      publishedAt: row.published_at,
      isCurrent: row.is_current,
    }));
}

/** Publishes a new version for the current season. Every player signs it again. */
export async function publishAuthorizationVersion(
  client: Client,
  content: AuthorizationContent,
): Promise<string> {
  const { data, error } = await client.rpc('publish_authorization_version', {
    p_content: content as unknown as Json,
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
  return z.string().parse(data);
}

export async function recordPaperAuthorization(
  client: Client,
  profileId: string,
  signedOn: string,
): Promise<void> {
  const { error } = await client.rpc('record_paper_authorization', {
    p_profile_id: profileId,
    p_signed_on: signedOn,
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
}

const participantAuthorizationRowSchema = z.object({
  id: z.uuid(),
  season_name: z.string(),
  version_number: z.number().int().nullable(),
  method: z.enum(['app', 'paper', 'staff_device']),
  language: z.string().nullable(),
  signed_at: z.string(),
  paper_signed_on: z.string().nullable(),
  unable_to_draw: z.boolean(),
  signature: signatureStrokesSchema.nullable(),
});

export interface ParticipantAuthorization {
  readonly id: string;
  readonly seasonName: string;
  readonly versionNumber: number | null;
  readonly method: 'app' | 'paper' | 'staff_device';
  readonly language: string | null;
  readonly signedAt: string;
  readonly paperSignedOn: string | null;
  readonly unableToDraw: boolean;
  /** Only with participants.view_sensitive. */
  readonly signature: SignatureStrokes | null;
}

export async function fetchParticipantAuthorizations(
  client: Client,
  profileId: string,
): Promise<readonly ParticipantAuthorization[]> {
  const { data, error } = await client.rpc('participant_authorizations', {
    p_profile_id: profileId,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  return z
    .array(participantAuthorizationRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      seasonName: row.season_name,
      versionNumber: row.version_number,
      method: row.method,
      language: row.language,
      signedAt: row.signed_at,
      paperSignedOn: row.paper_signed_on,
      unableToDraw: row.unable_to_draw,
      signature: row.signature,
    }));
}

export interface ParticipantConsent {
  readonly key: AuthorizationConsentKey;
  readonly granted: boolean;
  readonly decidedAt: string;
  readonly method: string;
}

export async function fetchParticipantConsents(
  client: Client,
  profileId: string,
): Promise<readonly ParticipantConsent[]> {
  const { data, error } = await client.rpc('participant_consents', { p_profile_id: profileId });
  if (error) throw new AppError('DB-1', { message: error.message });
  return z
    .array(
      z.object({
        consent_key: z.enum(CONSENT_KEYS),
        granted: z.boolean(),
        decided_at: z.string(),
        method: z.string(),
      }),
    )
    .parse(data ?? [])
    .map((row) => ({
      key: row.consent_key,
      granted: row.granted,
      decidedAt: row.decided_at,
      method: row.method,
    }));
}
