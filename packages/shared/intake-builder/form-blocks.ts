/**
 * The blocks of a form (RAPP-690, RAPP-770): a signature, a text, or points.
 *
 * A block sits on an Onboarding screen (an app screen or a Ramassà screen), on
 * a screen of a form the team created, or on the entity form, and shares one
 * order with the fields and consents placed there (`reorder_placements`
 * orders them all). Each kind holds its own content, in five languages with
 * the Catalan written; another language left empty shows the Catalan:
 *
 *   - `signature`: the text to accept and a box she signs in. It is no data
 *     about her: it is the act of agreeing to a text inside a given form. It
 *     is always required where it sits;
 *   - `text`: a text she reads, under an optional heading;
 *   - `points`: one to eight points, each a title and a text, by the app
 *     terms' points rule (`localizedPointsSchema`).
 *
 * Only a signature block asks something: every signature check reads
 * `signatureBlocks` first. The form sends each signature with its own submit,
 * by block id: `{[blockId]: {strokes, language}}`, the strokes in the format
 * of the authorization pad and the language the text was shown in. The
 * database keeps the text exactly as shown, who signed and when
 * (`public.form_signatures`), and refuses the form while a signature block is
 * unsigned. An older build leaves out a kind it cannot read.
 *
 * Docs: https://zod.dev/api
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { signatureStrokesSchema, type SignatureStrokes } from '../equipment/handover';
import { AppError, databaseErrorCode } from '../errors';
import { resolveLocalizedText } from '../i18n/localized-content';
import {
  cleanLocalizedPoints,
  localizedPointsSchema,
  type LocalizedPoint,
} from '../onboarding/app-terms';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';
import { anyLanguageTextSchema, type BuilderText } from './profile-layout';

type Client = SupabaseClient<Database>;

export const FORM_BLOCK_SURFACES = ['onboarding', 'entity_form', 'custom_form'] as const;
export type FormBlockSurface = (typeof FORM_BLOCK_SURFACES)[number];

export const FORM_BLOCK_KINDS = ['signature', 'text', 'points'] as const;
export type FormBlockKind = (typeof FORM_BLOCK_KINDS)[number];

/** Where a block sits and its place in the order it shares with the fields. */
interface FormBlockPlace {
  readonly id: string;
  readonly surface: FormBlockSurface;
  /** The screen of her Onboarding or of a form it sits on; null on the entity form. */
  readonly screenKey: string | null;
  /** The form the team created it sits on (RAPP-700); null everywhere else. */
  readonly customFormId?: string | null;
  readonly sortOrder: number;
}

/** A signature block: the text to accept, then a box she signs in. */
export interface SignatureFormBlock extends FormBlockPlace {
  readonly kind: 'signature';
  /** The text to accept, in five languages, Catalan required. */
  readonly body: BuilderText;
}

/** A text block (RAPP-770): a text she reads, under an optional heading. */
export interface TextFormBlock extends FormBlockPlace {
  readonly kind: 'text';
  readonly title: BuilderText | null;
  /** The text, in five languages, Catalan required. */
  readonly body: BuilderText;
}

/** A points block (RAPP-770): one to eight points, each a title and a text. */
export interface PointsFormBlock extends FormBlockPlace {
  readonly kind: 'points';
  readonly points: readonly LocalizedPoint[];
}

/** A block of a form, by its kind. */
export type FormBlock = SignatureFormBlock | TextFormBlock | PointsFormBlock;

/** What a block holds, by kind: what staff write and the database checks. */
export type FormBlockContent =
  | { readonly kind: 'signature'; readonly body: BuilderText }
  | { readonly kind: 'text'; readonly title: BuilderText | null; readonly body: BuilderText }
  | { readonly kind: 'points'; readonly points: readonly LocalizedPoint[] };

const placeRowSchema = z.object({
  id: z.uuid(),
  surface: z.enum(FORM_BLOCK_SURFACES),
  screen_key: z.string().nullable(),
  custom_form_id: z.uuid().nullable().optional(),
  sort_order: z.number().int(),
});

const signatureBlockRowSchema = placeRowSchema.extend({
  kind: z.literal('signature'),
  body: anyLanguageTextSchema,
});

const textRowSchema = placeRowSchema.extend({
  kind: z.literal('text'),
  title: anyLanguageTextSchema.nullable().optional(),
  body: anyLanguageTextSchema,
});

const pointsRowSchema = placeRowSchema.extend({
  kind: z.literal('points'),
  points: localizedPointsSchema,
});

function placeOf(row: z.infer<typeof placeRowSchema>): FormBlockPlace {
  return {
    id: row.id,
    surface: row.surface,
    screenKey: row.screen_key,
    customFormId: row.custom_form_id ?? null,
    sortOrder: row.sort_order,
  };
}

/** One parser per kind; a row none of them reads is left out. */
const BLOCK_PARSERS: readonly ((row: unknown) => FormBlock | null)[] = [
  (row) => {
    const parsed = signatureBlockRowSchema.safeParse(row);
    return parsed.success
      ? { ...placeOf(parsed.data), kind: 'signature', body: parsed.data.body }
      : null;
  },
  (row) => {
    const parsed = textRowSchema.safeParse(row);
    return parsed.success
      ? {
          ...placeOf(parsed.data),
          kind: 'text',
          title: parsed.data.title ?? null,
          body: parsed.data.body,
        }
      : null;
  },
  (row) => {
    const parsed = pointsRowSchema.safeParse(row);
    return parsed.success
      ? { ...placeOf(parsed.data), kind: 'points', points: parsed.data.points }
      : null;
  },
];

/** The blocks of the catalog; a row this build cannot read is left out. */
export function parseFormBlocks(raw: unknown): readonly FormBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): FormBlock[] => {
    for (const parse of BLOCK_PARSERS) {
      const block = parse(row);
      if (block !== null) return [block];
    }
    return [];
  });
}

/** The signature blocks among these: the only blocks that ask her something. */
export function signatureBlocks(
  blocks: readonly FormBlock[] | undefined,
): readonly SignatureFormBlock[] {
  return (blocks ?? []).filter((block): block is SignatureFormBlock => block.kind === 'signature');
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
  return signatureBlocks(formBlocksOn(blocks, 'onboarding', screenKey)).length > 0;
}

/**
 * Whether a screen of her Onboarding holds any block. A Ramassà screen with
 * only a text or points block shows (RAPP-770); an app screen shows for its
 * signatures only (`hasSignatureBlocks`), so a text never brings back a
 * screen she would skip.
 */
export function hasFormBlocks(
  blocks: readonly FormBlock[] | undefined,
  screenKey: string,
): boolean {
  return formBlocksOn(blocks, 'onboarding', screenKey).length > 0;
}

/** A localized text as she reads it, and the language it is shown in: hers, else the Catalan. */
export function formBlockText(
  block: { readonly body: BuilderText },
  language: LanguageCode,
): { readonly text: string; readonly language: LanguageCode } {
  const resolved = resolveLocalizedText(block.body, language);
  return resolved === undefined
    ? { text: '', language: 'ca' }
    : { text: resolved.text, language: resolved.language as LanguageCode };
}

/** What a block shows, in one language: a heading and a text, or the points. */
export type ResolvedFormBlock =
  | { readonly kind: 'signature'; readonly body: string }
  | { readonly kind: 'text'; readonly title: string; readonly body: string }
  | {
      readonly kind: 'points';
      readonly points: readonly { readonly title: string; readonly body: string }[];
    };

/** A block's content as she reads it in `language`. */
export function resolveFormBlock(
  block: FormBlockContent,
  language: LanguageCode,
): ResolvedFormBlock {
  const text = (value: BuilderText | null) =>
    value === null ? '' : formBlockText({ body: value }, language).text;
  switch (block.kind) {
    case 'signature':
      return { kind: 'signature', body: text(block.body) };
    case 'text':
      return { kind: 'text', title: text(block.title), body: text(block.body) };
    case 'points':
      return {
        kind: 'points',
        points: block.points.map((point) => ({ title: text(point.title), body: text(point.body) })),
      };
  }
}

/** A block's name in a list: its heading or its text, or its first point. */
export function formBlockName(block: FormBlockContent, language: LanguageCode): string {
  const shown = resolveFormBlock(block, language);
  if (shown.kind === 'points') return shown.points[0]?.title ?? '';
  if (shown.kind === 'text' && shown.title !== '') return shown.title;
  return shown.body;
}

/** One signature as a form sends it. */
export interface FormSignature {
  readonly strokes: SignatureStrokes;
  readonly language: LanguageCode;
}

/** The strokes she drew, by block id, while she fills in the form. */
export type FormSignatureDrafts = Readonly<Record<string, SignatureStrokes | null>>;

export const formSignatureDraftsSchema = z.record(z.string(), signatureStrokesSchema.nullable());

/** The signature blocks with no signature yet: the form does not go while any is left. */
export function unsignedFormBlocks(
  blocks: readonly FormBlock[],
  drafts: FormSignatureDrafts | undefined,
): readonly string[] {
  return signatureBlocks(blocks).flatMap((block) => (drafts?.[block.id] ? [] : [block.id]));
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
    signatureBlocks(blocks).flatMap((block) => {
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

/** A localized text with its empty languages dropped, so "" never hides the Catalan. */
function cleanText(text: BuilderText): BuilderText {
  return Object.fromEntries(
    Object.entries(text).flatMap(([language, value]) =>
      typeof value === 'string' && value.trim() !== '' ? [[language, value.trim()]] : [],
    ),
  ) as BuilderText;
}

/**
 * Adds a block to a screen or to the entity form (`id` null), or saves its
 * texts. A block keeps its kind; the entity form holds signatures only.
 */
export async function saveFormBlock(
  client: Pick<Client, 'rpc'>,
  block: {
    readonly id: string | null;
    readonly surface: FormBlockSurface;
    readonly screenKey: string | null;
  } & FormBlockContent,
): Promise<string> {
  const title = block.kind === 'text' && block.title !== null ? cleanText(block.title) : null;
  const { data, error } = await client.rpc('save_form_block', {
    p_id: block.id as string,
    p_surface: block.surface,
    p_screen_key: block.screenKey as string,
    p_kind: block.kind,
    p_body: (block.kind === 'points' ? null : cleanText(block.body)) as Json,
    p_title: (title === null || Object.keys(title).length === 0 ? null : title) as Json,
    p_points: (block.kind === 'points' ? cleanLocalizedPoints(block.points) : null) as Json,
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
 * The Onboarding signature blocks of the live screens: an app screen's, or a
 * Ramassà screen's that is not archived. The walk-in tablet asks these (RAPP-691).
 */
export function liveOnboardingBlocks(catalog: {
  readonly blocks?: readonly FormBlock[];
  readonly screens: readonly { readonly id: string; readonly isArchived: boolean }[];
}): readonly SignatureFormBlock[] {
  const live = new Set(catalog.screens.filter((screen) => !screen.isArchived).map((s) => s.id));
  return signatureBlocks(catalog.blocks)
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
export function isFormBlockSigned(
  block: SignatureFormBlock,
  signed: readonly MySignedBlock[],
): boolean {
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
  /** Onboarding, the entity form, or a form the team created (RAPP-700). */
  readonly surface: 'wizard' | 'entity_form' | 'custom_form';
  /** The Onboarding or form screen it was given on; null on the entity form. */
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
  surface: z.enum(['wizard', 'entity_form', 'custom_form']),
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
