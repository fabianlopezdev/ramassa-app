/**
 * Dades legals (RAPP-699): consents defined once and asked on any form.
 *
 * A consent has a stable key, a name and the text she ticks, in five
 * languages (Catalan required). The seven consents the app knew are system
 * consents (`systemKey`): staff rename, reword and archive them, and their key
 * stays, because the app reads them by key (image rights drive the photo
 * consent, the health data consent keeps her health answer).
 *
 * A consent is placed like a field: on the authorization's consents screen
 * (`authorization`) or on an Onboarding screen (`onboarding`, with its screen),
 * required or not, in the order the screen shares with its fields and blocks.
 * The authorization's published versions keep the texts they showed; a text
 * edited here reaches players with the form's next Desa.
 *
 * Every decision is kept with the text she was shown (`consent_events`); her
 * current state of a consent is its latest decision.
 *
 * Docs: https://zod.dev/api
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { resolveLocalizedText } from '../i18n/localized-content';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';
import { anyLanguageTextSchema, type BuilderText } from './profile-layout';

type Client = SupabaseClient<Database>;

export const CONSENT_SURFACES = ['authorization', 'onboarding'] as const;
export type ConsentSurface = (typeof CONSENT_SURFACES)[number];

/** The consents the app reads by key. */
export const SYSTEM_CONSENT_KEYS = [
  'participation',
  'data_processing',
  'code_of_conduct',
  'health_data',
  'image_rights',
  'newsletter',
  'messaging_groups',
] as const;

/** A consent of the catalogue. */
export interface Consent {
  readonly id: string;
  readonly key: string;
  /** Set on a consent the app reads by key; it can be renamed, never rekeyed. */
  readonly systemKey: string | null;
  readonly name: BuilderText;
  /** The text she ticks. */
  readonly body: BuilderText;
  readonly isArchived: boolean;
}

/** Where a consent is asked. */
export interface ConsentPlacement {
  readonly id: string;
  readonly consentId: string;
  readonly surface: ConsentSurface;
  /** The Onboarding screen; null on the authorization's consents screen. */
  readonly screenKey: string | null;
  readonly sortOrder: number;
  readonly required: boolean;
}

/** A consent as a screen asks it: the consent and its placement there. */
export interface PlacedConsent extends Consent {
  readonly placementId: string;
  readonly required: boolean;
  readonly sortOrder: number;
}

const consentRowSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  system_key: z.string().nullable(),
  name: anyLanguageTextSchema,
  body: anyLanguageTextSchema,
  is_archived: z.boolean(),
});

const placementRowSchema = z.object({
  id: z.uuid(),
  consent_id: z.uuid(),
  surface: z.enum(CONSENT_SURFACES),
  screen_key: z.string().nullable(),
  sort_order: z.number().int(),
  required: z.boolean(),
});

/** The catalogue's consents; a row this build cannot read is left out. */
export function parseConsents(raw: unknown): readonly Consent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): Consent[] => {
    const parsed = consentRowSchema.safeParse(row);
    if (!parsed.success) return [];
    return [
      {
        id: parsed.data.id,
        key: parsed.data.key,
        systemKey: parsed.data.system_key,
        name: parsed.data.name,
        body: parsed.data.body,
        isArchived: parsed.data.is_archived,
      },
    ];
  });
}

/** Where each consent is asked; a row this build cannot read is left out. */
export function parseConsentPlacements(raw: unknown): readonly ConsentPlacement[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): ConsentPlacement[] => {
    const parsed = placementRowSchema.safeParse(row);
    if (!parsed.success) return [];
    return [
      {
        id: parsed.data.id,
        consentId: parsed.data.consent_id,
        surface: parsed.data.surface,
        screenKey: parsed.data.screen_key,
        sortOrder: parsed.data.sort_order,
        required: parsed.data.required,
      },
    ];
  });
}

/** The consents a screen asks, in its order: the authorization's (`screenKey` null) or an Onboarding screen's. */
export function consentsOn(
  catalog: {
    readonly consents?: readonly Consent[];
    readonly consentPlacements?: readonly ConsentPlacement[];
  },
  surface: ConsentSurface,
  screenKey: string | null,
): readonly PlacedConsent[] {
  const byId = new Map((catalog.consents ?? []).map((consent) => [consent.id, consent]));
  return (catalog.consentPlacements ?? [])
    .filter((placement) => placement.surface === surface && placement.screenKey === screenKey)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((placement): PlacedConsent[] => {
      const consent = byId.get(placement.consentId);
      return consent === undefined || consent.isArchived
        ? []
        : [
            {
              ...consent,
              placementId: placement.id,
              required: placement.required,
              sortOrder: placement.sortOrder,
            },
          ];
    });
}

/** Every form that asks a consent. */
export function surfacesOfConsent(
  placements: readonly ConsentPlacement[] | undefined,
  consentId: string,
): readonly ConsentSurface[] {
  return CONSENT_SURFACES.filter((surface) =>
    (placements ?? []).some(
      (placement) => placement.consentId === consentId && placement.surface === surface,
    ),
  );
}

/** A text in her language, or the first one written, and the language it shows in. */
export function consentText(
  text: BuilderText,
  language: LanguageCode,
): { readonly text: string; readonly language: LanguageCode } {
  const resolved = resolveLocalizedText(text, language);
  return resolved === undefined
    ? { text: '', language: 'ca' }
    : { text: resolved.text, language: resolved.language as LanguageCode };
}

/** Her ticks of a form's consents, by key, as the form sends them: every consent asked, ticked or not. */
export function consentDecisionsPayload(
  asked: readonly Pick<PlacedConsent, 'key'>[],
  ticked: Readonly<Record<string, boolean>> | undefined,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(asked.map(({ key }) => [key, ticked?.[key] === true]));
}

/** The required consents she has not ticked: the form does not go while any is left. */
export function untickedRequiredConsents(
  asked: readonly Pick<PlacedConsent, 'key' | 'required'>[],
  ticked: Readonly<Record<string, boolean>> | undefined,
): readonly string[] {
  return asked.flatMap(({ key, required }) => (required && ticked?.[key] !== true ? [key] : []));
}

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** Adds a consent, or renames and rewords one (`id` set). */
export async function saveConsent(
  client: Pick<Client, 'rpc'>,
  consent: { readonly id: string | null; readonly name: BuilderText; readonly body: BuilderText },
): Promise<string> {
  const { data, error } = await client.rpc('save_consent', {
    p_id: consent.id as string,
    p_name: consent.name as Json,
    p_body: consent.body as Json,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

/** Archives a consent (it leaves every form) or brings it back. */
export async function archiveConsent(
  client: Pick<Client, 'rpc'>,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client.rpc('archive_consent', { p_id: id, p_archived: archived });
  if (error) throw databaseError(error);
}

/** Asks a consent on the authorization or on an Onboarding screen. */
export async function placeConsent(
  client: Pick<Client, 'rpc'>,
  placement: {
    readonly consentId: string;
    readonly surface: ConsentSurface;
    readonly screenKey: string | null;
    readonly required: boolean;
  },
): Promise<string> {
  const { data, error } = await client.rpc('place_consent', {
    p_consent_id: placement.consentId,
    p_surface: placement.surface,
    p_screen_key: placement.screenKey as string,
    p_required: placement.required,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function saveConsentPlacement(
  client: Pick<Client, 'rpc'>,
  placementId: string,
  required: boolean,
): Promise<void> {
  const { error } = await client.rpc('save_consent_placement', {
    p_placement_id: placementId,
    p_required: required,
  });
  if (error) throw databaseError(error);
}

export async function removeConsentPlacement(
  client: Pick<Client, 'rpc'>,
  placementId: string,
): Promise<void> {
  const { error } = await client.rpc('remove_consent_placement', {
    p_placement_id: placementId,
  });
  if (error) throw databaseError(error);
}
