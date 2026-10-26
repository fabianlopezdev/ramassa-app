/**
 * The blocks of a form (RAPP-690): today the signature block.
 *
 * A signature is no data about her. It is the act of agreeing to a text inside
 * a given form, so it is a block of the form builders: an Onboarding screen or
 * the entity form. A block holds the text to accept in five languages (Catalan
 * required) and asks for a signature under it. It is always required where it
 * sits, a form can hold several, and it shares one order with the fields
 * placed there (`reorder_placements` orders both).
 *
 * The form sends each signature with its own submit, by block id:
 * `{[blockId]: {strokes, language}}`, the strokes in the format of the
 * authorization pad and the language the text was shown in. The database
 * keeps the text exactly as shown, who signed and when
 * (`public.form_signatures`), and refuses the form while a block is unsigned.
 *
 * Docs: https://zod.dev/api
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { signatureStrokesSchema, type SignatureStrokes } from '../equipment/handover';
import { AppError, databaseErrorCode } from '../errors';
import { resolveLocalizedText } from '../i18n/localized-content';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';
import { anyLanguageTextSchema, type BuilderText } from './profile-layout';

type Client = SupabaseClient<Database>;

export const FORM_BLOCK_SURFACES = ['onboarding', 'entity_form'] as const;
export type FormBlockSurface = (typeof FORM_BLOCK_SURFACES)[number];

/** A signature block of a form. */
export interface FormBlock {
  readonly id: string;
  readonly surface: FormBlockSurface;
  /** The screen of her Onboarding it sits on; null on the entity form. */
  readonly screenKey: string | null;
  readonly kind: 'signature';
  /** The text to accept, in five languages, Catalan required. */
  readonly body: BuilderText;
  readonly sortOrder: number;
}

const blockRowSchema = z.object({
  id: z.uuid(),
  surface: z.enum(FORM_BLOCK_SURFACES),
  screen_key: z.string().nullable(),
  kind: z.literal('signature'),
  body: anyLanguageTextSchema,
  sort_order: z.number().int(),
});

/** The blocks of the catalog; a row this build cannot read is left out. */
export function parseFormBlocks(raw: unknown): readonly FormBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): FormBlock[] => {
    const parsed = blockRowSchema.safeParse(row);
    if (!parsed.success) return [];
    return [
      {
        id: parsed.data.id,
        surface: parsed.data.surface,
        screenKey: parsed.data.screen_key,
        kind: parsed.data.kind,
        body: parsed.data.body,
        sortOrder: parsed.data.sort_order,
      },
    ];
  });
}

/** The blocks of one screen of her Onboarding, or of the entity form (`screenKey` null), in order. */
export function formBlocksOn(
  blocks: readonly FormBlock[] | undefined,
  surface: FormBlockSurface,
  screenKey: string | null,
): readonly FormBlock[] {
  return (blocks ?? [])
    .filter((block) => block.surface === surface && block.screenKey === screenKey)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Whether a screen of her Onboarding holds a signature block: she is always shown it. */
export function hasSignatureBlocks(
  blocks: readonly FormBlock[] | undefined,
  screenKey: string,
): boolean {
  return formBlocksOn(blocks, 'onboarding', screenKey).length > 0;
}

/** The text of a block as she reads it, and the language it is shown in. */
export function formBlockText(
  block: Pick<FormBlock, 'body'>,
  language: LanguageCode,
): { readonly text: string; readonly language: LanguageCode } {
  const resolved = resolveLocalizedText(block.body, language);
  return resolved === undefined
    ? { text: '', language: 'ca' }
    : { text: resolved.text, language: resolved.language as LanguageCode };
}

/** One signature as a form sends it. */
export interface FormSignature {
  readonly strokes: SignatureStrokes;
  readonly language: LanguageCode;
}

/** The strokes she drew, by block id, while she fills in the form. */
export type FormSignatureDrafts = Readonly<Record<string, SignatureStrokes | null>>;

export const formSignatureDraftsSchema = z.record(z.string(), signatureStrokesSchema.nullable());

/** The blocks with no signature yet: the form does not go while any is left. */
export function unsignedFormBlocks(
  blocks: readonly FormBlock[],
  drafts: FormSignatureDrafts | undefined,
): readonly string[] {
  return blocks.flatMap((block) => (drafts?.[block.id] ? [] : [block.id]));
}

/**
 * The signatures to send with the form: each signed block of these, with the
 * language its text is shown in. A block no longer on the form is left out.
 */
export function formSignaturesPayload(
  blocks: readonly FormBlock[],
  drafts: FormSignatureDrafts | undefined,
  language: LanguageCode,
): Json {
  return Object.fromEntries(
    blocks.flatMap((block) => {
      const strokes = drafts?.[block.id];
      if (!strokes) return [];
      const signature: FormSignature = {
        strokes,
        language: formBlockText(block, language).language,
      };
      return [[block.id, signature as unknown as Json]];
    }),
  ) as Json;
}

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** Adds a signature block to a screen or to the entity form, or saves its text (`id` set). */
export async function saveFormBlock(
  client: Pick<Client, 'rpc'>,
  block: {
    readonly id: string | null;
    readonly surface: FormBlockSurface;
    readonly screenKey: string | null;
    readonly body: BuilderText;
  },
): Promise<string> {
  const { data, error } = await client.rpc('save_form_block', {
    p_id: block.id as string,
    p_surface: block.surface,
    p_screen_key: block.screenKey as string,
    p_body: block.body as Json,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

/** Removes a block; the signatures given to it keep their text. */
export async function removeFormBlock(client: Pick<Client, 'rpc'>, id: string): Promise<void> {
  const { error } = await client.rpc('remove_form_block', { p_id: id });
  if (error) throw databaseError(error);
}

/**
 * The Onboarding blocks of the live screens: an app screen's, or a Ramassà
 * screen's that is not archived. The walk-in tablet asks these (RAPP-691).
 */
export function liveOnboardingBlocks(catalog: {
  readonly blocks?: readonly FormBlock[];
  readonly screens: readonly { readonly id: string; readonly isArchived: boolean }[];
}): readonly FormBlock[] {
  const live = new Set(catalog.screens.filter((screen) => !screen.isArchived).map((s) => s.id));
  return (catalog.blocks ?? [])
    .filter(
      (block) =>
        block.surface === 'onboarding' &&
        block.screenKey !== null &&
        (!UUID_PATTERN.test(block.screenKey) || live.has(block.screenKey)),
    )
    .sort(
      (a, b) => (a.screenKey ?? '').localeCompare(b.screenKey ?? '') || a.sortOrder - b.sortOrder,
    );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One of her own signatures of an Onboarding block, as her phone reads it. */
export interface MySignedBlock {
  readonly blockId: string;
  /** The text as she signed it, in `language`. */
  readonly body: string;
  readonly language: LanguageCode;
}

/**
 * Whether she already signed this block (RAPP-691): one of her signatures
 * holds the block's text exactly as it now reads in the language she signed
 * it in. A changed text asks for a new signature; the database reads the same
 * rule (`private.unsigned_form_blocks`).
 */
export function isFormBlockSigned(block: FormBlock, signed: readonly MySignedBlock[]): boolean {
  return signed.some(
    (signature) =>
      signature.blockId === block.id && block.body[signature.language] === signature.body,
  );
}

/** Her own signatures of the Onboarding blocks; none when they cannot be read. */
export async function fetchMyFormSignatures(
  client: Pick<Client, 'rpc'>,
): Promise<readonly MySignedBlock[]> {
  const { data, error } = await client.rpc('my_form_signatures');
  if (error) throw databaseError(error);
  return z
    .array(
      z.object({
        block_id: z.uuid(),
        body: z.string(),
        language: z.enum(['ca', 'es', 'en', 'ar', 'fa']),
      }),
    )
    .parse(data ?? [])
    .map((row) => ({ blockId: row.block_id, body: row.body, language: row.language }));
}

/** One signature on her page. */
export interface ParticipantFormSignature {
  readonly id: string;
  readonly surface: 'wizard' | 'entity_form';
  /** The Onboarding screen it was given on; null on the entity form. */
  readonly screenKey: string | null;
  /** The text exactly as shown, in the language it was shown in. */
  readonly body: string;
  readonly language: LanguageCode;
  readonly signerKind: 'player' | 'entity';
  readonly signerName: string;
  readonly strokes: SignatureStrokes | null;
  readonly signedAt: string;
  /** Signed on the walk-in tablet (RAPP-691), with the team member present. */
  readonly signedOnTablet: boolean;
  readonly witnessedByName: string | null;
}

const signatureRowSchema = z.object({
  id: z.uuid(),
  surface: z.enum(['wizard', 'entity_form']),
  screen_key: z.string().nullable(),
  body: z.string(),
  language: z.enum(['ca', 'es', 'en', 'ar', 'fa']),
  signer_kind: z.enum(['player', 'entity']),
  signer_name: z.string(),
  strokes: z.unknown(),
  signed_at: z.string(),
  signed_on_tablet: z.boolean().optional(),
  witnessed_by_name: z.string().nullable().optional(),
});

/** Her signatures of the form blocks, for staff with participants.view_personal. */
export async function fetchParticipantFormSignatures(
  client: Pick<Client, 'rpc'>,
  profileId: string,
): Promise<readonly ParticipantFormSignature[]> {
  const { data, error } = await client.rpc('participant_form_signatures', {
    p_profile_id: profileId,
  });
  if (error) throw databaseError(error);
  return z
    .array(signatureRowSchema)
    .parse(data ?? [])
    .map((row) => {
      const strokes = signatureStrokesSchema.safeParse(row.strokes);
      return {
        id: row.id,
        surface: row.surface,
        screenKey: row.screen_key,
        body: row.body,
        language: row.language,
        signerKind: row.signer_kind,
        signerName: row.signer_name,
        strokes: strokes.success ? strokes.data : null,
        signedAt: row.signed_at,
        signedOnTablet: row.signed_on_tablet ?? false,
        witnessedByName: row.witnessed_by_name ?? null,
      };
    });
}
