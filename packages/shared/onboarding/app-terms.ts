/**
 * The app terms, versioned and edited by staff (RAPP-613).
 *
 * The terms she accepts were one bundled string per language and a code
 * constant for the version, so a new text needed a release and asked nobody
 * again. Now each organization keeps numbered versions, modelled on the season
 * authorization (`authorization_versions`, RAPP-304):
 *
 *   - a version holds, per language, the terms screen (title, body, accept
 *     label, the photo and video consent wording) and the introduction screen
 *     before it (title, intro, the bullet points);
 *   - staff keep one draft, and a publish numbers it and freezes it. The
 *     database refuses any change to a published version;
 *   - after a publish, every player accepts the new version on her next app
 *     open, on the terms screen alone;
 *   - version 1 is the text the app bundled, generated from the locale files
 *     (`bundledAppTermsContent`), so nobody was asked again when it shipped.
 *
 * Catalan is required in every field; another language may be empty and then
 * shows the Catalan text. The language she was shown is what her acceptance
 * records.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { SaveKind } from '../authorization/authorization';
import { AppError, databaseErrorCode } from '../errors';
import { resolveLocalizedText } from '../i18n/localized-content';
import type { Consent, ConsentPlacement } from '../intake-builder/consents';
import type { CustomForm } from '../intake-builder/custom-form-model';
import type { FormBlock } from '../intake-builder/form-blocks';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** At most this many points, on the terms' introduction or a points block: the screen stays one read. */
export const APP_TERMS_MAX_POINTS = 8;

const termsTextSchema = z.object({
  ca: z.string().optional(),
  es: z.string().optional(),
  en: z.string().optional(),
  ar: z.string().optional(),
  fa: z.string().optional(),
});
export type AppTermsText = z.infer<typeof termsTextSchema>;

const catalanRequired = termsTextSchema.refine((text) => (text.ca ?? '').trim().length > 0, {
  message: 'catalan required',
});

/** One point: a title and a text, each with its Catalan written. */
export const localizedPointSchema = z.object({ title: catalanRequired, body: catalanRequired });
export type LocalizedPoint = z.infer<typeof localizedPointSchema>;

/**
 * The points of the app terms' introduction and of a points block of a form
 * (RAPP-770): one rule, `private.form_points_valid`.
 */
export const localizedPointsSchema = z.array(localizedPointSchema).min(1).max(APP_TERMS_MAX_POINTS);

/** A version's content as stored. Mirrors `private.app_terms_content_valid`. */
export const appTermsDraftSchema = z.object({
  title: catalanRequired,
  body: catalanRequired,
  intro_title: catalanRequired,
  intro: catalanRequired,
  points: localizedPointsSchema,
  accept_label: catalanRequired,
  media_label: catalanRequired,
  media_hint: catalanRequired,
});
export type AppTermsContent = z.infer<typeof appTermsDraftSchema>;

export const APP_TERMS_TEXT_FIELDS = [
  'title',
  'body',
  'intro_title',
  'intro',
  'accept_label',
  'media_label',
  'media_hint',
] as const;
export type AppTermsTextField = (typeof APP_TERMS_TEXT_FIELDS)[number];

// Version 1: the bundled text -------------------------------------------------------------------

type OnboardingStrings = Readonly<Record<string, unknown>>;

/** The bundled keys behind each field, so version 1 is the text the app shipped. */
const BUNDLED_KEYS: Readonly<Record<AppTermsTextField, string>> = {
  title: 'termsTitle',
  body: 'termsBody',
  intro_title: 'termsIntroTitle',
  intro: 'termsIntro',
  accept_label: 'termsAcceptLabel',
  media_label: 'mediaConsentLabel',
  media_hint: 'mediaConsentHint',
};

const BUNDLED_POINT_KEYS = ['Purpose', 'Protected', 'Private', 'Control'] as const;

/** The bundled `onboarding` strings of the five languages, as one version. */
export function bundledAppTermsContent(
  strings: Readonly<Record<LanguageCode, OnboardingStrings>>,
): AppTermsContent {
  const field = (key: string): AppTermsText =>
    Object.fromEntries(
      Object.entries(strings).flatMap(([language, values]) =>
        typeof values[key] === 'string' ? [[language, values[key]]] : [],
      ),
    ) as AppTermsText;
  return {
    title: field(BUNDLED_KEYS.title),
    body: field(BUNDLED_KEYS.body),
    intro_title: field(BUNDLED_KEYS.intro_title),
    intro: field(BUNDLED_KEYS.intro),
    points: BUNDLED_POINT_KEYS.map((point) => ({
      title: field(`termsPoint${point}Title`),
      body: field(`termsPoint${point}Body`),
    })),
    accept_label: field(BUNDLED_KEYS.accept_label),
    media_label: field(BUNDLED_KEYS.media_label),
    media_hint: field(BUNDLED_KEYS.media_hint),
  };
}

// What she reads ---------------------------------------------------------------------------------

export interface ResolvedAppTerms {
  readonly title: string;
  readonly body: string;
  readonly introTitle: string;
  readonly intro: string;
  readonly points: readonly { readonly title: string; readonly body: string }[];
  readonly acceptLabel: string;
  readonly mediaLabel: string;
  readonly mediaHint: string;
  /** The language of the body she is shown: hers, or Catalan when hers is empty. */
  readonly localeShown: LanguageCode;
}

function textFor(text: AppTermsText, language: LanguageCode): string {
  return resolveLocalizedText(text, language)?.text ?? '';
}

export function resolveAppTerms(
  content: AppTermsContent,
  language: LanguageCode,
): ResolvedAppTerms {
  return {
    title: textFor(content.title, language),
    body: textFor(content.body, language),
    introTitle: textFor(content.intro_title, language),
    intro: textFor(content.intro, language),
    points: content.points.map((point) => ({
      title: textFor(point.title, language),
      body: textFor(point.body, language),
    })),
    acceptLabel: textFor(content.accept_label, language),
    mediaLabel: textFor(content.media_label, language),
    mediaHint: textFor(content.media_hint, language),
    localeShown: resolveLocalizedText(content.body, language)?.language ?? 'ca',
  };
}

/**
 * The version she is shown, as the onboarding catalog carries it: the current
 * published one, or the draft for a test player (RAPP-619).
 */
export interface CurrentAppTerms {
  readonly id: string;
  /** Null for a draft. */
  readonly versionNumber: number | null;
  readonly isDraft: boolean;
  /**
   * The old content an older build reads (RAPP-613); null when this build
   * cannot read it. Her phone reads the terms form instead (RAPP-772).
   */
  readonly content: AppTermsContent | null;
  /**
   * The terms form (RAPP-772): its screens, as the version froze them, are in
   * the catalog's forms. Null from an older server, which knows the old
   * content only (`appTermsAsForm`).
   */
  readonly formId: string | null;
}

const catalogTermsSchema = z
  .object({
    id: z.uuid(),
    version_number: z.number().int().min(1).nullable(),
    content: appTermsDraftSchema.nullable().catch(null),
    // Older servers omit it: every version they send is published.
    is_draft: z.boolean().optional().default(false),
    // The terms form (RAPP-772); an older server sends none.
    form_id: z.uuid().nullable().optional().catch(null),
  })
  .refine((terms) => terms.is_draft === (terms.version_number === null), {
    message: 'a published version has its number and a draft has none',
  });

/**
 * The catalog's `terms`. A version this build cannot read gives null: her
 * phone then asks her to try again and never lets her past the terms.
 */
export function appTermsFromCatalog(raw: unknown): CurrentAppTerms | null {
  const parsed = catalogTermsSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.content === null && (parsed.data.form_id ?? null) === null) return null;
  return {
    id: parsed.data.id,
    versionNumber: parsed.data.version_number,
    isDraft: parsed.data.is_draft,
    content: parsed.data.content,
    formId: parsed.data.form_id ?? null,
  };
}

// The old content as a form -------------------------------------------------------------------------

/**
 * Ids of the terms form an older server's content stands for. They are never
 * sent: what she gives on them travels as the old acceptance.
 */
export const LEGACY_TERMS_IDS = {
  form: '00000000-0000-4000-8000-00000000a770',
  introScreen: '00000000-0000-4000-8000-00000000a771',
  signScreen: '00000000-0000-4000-8000-00000000a772',
  pointsBlock: '00000000-0000-4000-8000-00000000a773',
  textBlock: '00000000-0000-4000-8000-00000000a774',
  signatureBlock: '00000000-0000-4000-8000-00000000a775',
  acceptConsent: '00000000-0000-4000-8000-00000000a776',
  mediaConsent: '00000000-0000-4000-8000-00000000a777',
} as const;

/** The consent keys the terms ask (RAPP-772): her acceptance, and her photo and video choice. */
export const APP_TERMS_ACCEPTANCE_KEY = 'app_terms';
export const APP_TERMS_MEDIA_KEY = 'image_rights';

/** The terms form as the catalog lists its parts. */
export interface AppTermsAsForm {
  readonly form: CustomForm;
  readonly blocks: readonly FormBlock[];
  readonly consents: readonly Consent[];
  readonly consentPlacements: readonly ConsentPlacement[];
}

/**
 * An older server's content as the terms form (RAPP-772), the way the
 * migration converts it: the introduction with its points, then the screen
 * she signs (the text, her acceptance, her photo and video choice, her
 * signature). Null when the content could not be read.
 */
export function appTermsAsForm(
  terms: CurrentAppTerms,
  signatureText: AppTermsText,
): AppTermsAsForm | null {
  const content = terms.content;
  if (content === null) return null;
  const ids = LEGACY_TERMS_IDS;
  const place = (screenKey: string, sortOrder: number) => ({
    surface: 'custom_form' as const,
    screenKey,
    customFormId: ids.form,
    sortOrder,
  });
  const consent = (id: string, key: string, body: AppTermsText): Consent => ({
    id,
    key,
    systemKey: key,
    name: body,
    body,
    isArchived: false,
  });
  return {
    form: {
      id: ids.form,
      name: content.title,
      filledBy: 'player',
      mandatory: 'required_to_use_app',
      deadline: null,
      audience: 'all',
      repeatsEachSeason: false,
      kind: 'legal',
      systemKey: 'app_terms',
      recipientCount: null,
      version: terms.versionNumber ?? 1,
      publishedAt: null,
      isArchived: false,
      versions: [],
      screens: [
        {
          id: ids.introScreen,
          title: content.intro_title,
          intro: content.intro,
          sortOrder: 0,
          texts: {},
        },
        {
          id: ids.signScreen,
          title: content.title,
          intro: content.media_hint,
          sortOrder: 1,
          texts: {},
          systemScreen: 'terms_sign',
        },
      ],
    },
    blocks: [
      { id: ids.pointsBlock, kind: 'points', points: content.points, ...place(ids.introScreen, 0) },
      {
        id: ids.textBlock,
        kind: 'text',
        title: null,
        body: content.body,
        ...place(ids.signScreen, 0),
      },
      {
        id: ids.signatureBlock,
        kind: 'signature',
        body: signatureText,
        ...place(ids.signScreen, 3),
      },
    ],
    consents: [
      consent(ids.acceptConsent, APP_TERMS_ACCEPTANCE_KEY, content.accept_label),
      consent(ids.mediaConsent, APP_TERMS_MEDIA_KEY, content.media_label),
    ],
    consentPlacements: [
      {
        id: ids.acceptConsent,
        consentId: ids.acceptConsent,
        required: true,
        ...place(ids.signScreen, 1),
      },
      {
        id: ids.mediaConsent,
        consentId: ids.mediaConsent,
        required: false,
        ...place(ids.signScreen, 2),
      },
    ],
  };
}

// Staff ------------------------------------------------------------------------------------------

export interface AppTermsVersion {
  readonly id: string;
  /** Null while it is the draft. */
  readonly versionNumber: number | null;
  readonly content: AppTermsContent;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
  readonly acceptanceCount: number;
  /** Published as a correction (RAPP-696): acceptances of the version before it still count. */
  readonly isCorrection: boolean;
}

const versionRowSchema = z.object({
  id: z.uuid(),
  version_number: z.number().int().nullable(),
  content: appTermsDraftSchema,
  published_at: z.string().nullable(),
  updated_at: z.string(),
  acceptance_count: z.number().int(),
  is_correction: z.boolean().default(false),
});

/** Every version of the organization, newest first, the draft on top. */
export async function fetchAppTermsVersions(client: Client): Promise<readonly AppTermsVersion[]> {
  const { data, error } = await client.rpc('list_app_terms_versions');
  if (error) throw databaseError(error);
  return z
    .array(versionRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      versionNumber: row.version_number,
      content: row.content,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      acceptanceCount: row.acceptance_count,
      isCorrection: row.is_correction,
    }));
}

function cleanTermsText(text: AppTermsText): AppTermsText {
  return Object.fromEntries(
    Object.entries(text).flatMap(([language, value]) =>
      typeof value === 'string' && value.trim().length > 0 ? [[language, value.trim()]] : [],
    ),
  ) as AppTermsText;
}

/** Points with empty languages dropped: the terms' and a points block's (RAPP-770). */
export function cleanLocalizedPoints(points: readonly LocalizedPoint[]): LocalizedPoint[] {
  return points.map((point) => ({
    title: cleanTermsText(point.title),
    body: cleanTermsText(point.body),
  }));
}

/** The content with empty languages dropped, so "" never hides the Catalan fallback. */
export function cleanAppTermsContent(content: AppTermsContent): AppTermsContent {
  return {
    title: cleanTermsText(content.title),
    body: cleanTermsText(content.body),
    intro_title: cleanTermsText(content.intro_title),
    intro: cleanTermsText(content.intro),
    points: cleanLocalizedPoints(content.points),
    accept_label: cleanTermsText(content.accept_label),
    media_label: cleanTermsText(content.media_label),
    media_hint: cleanTermsText(content.media_hint),
  };
}

/** Saves the organization's one draft (creates it the first time). */
export async function saveAppTermsDraft(client: Client, content: AppTermsContent): Promise<void> {
  const cleaned = appTermsDraftSchema.parse(cleanAppTermsContent(content));
  const { error } = await client.rpc('save_app_terms_draft', {
    p_content: cleaned as unknown as Json,
  });
  if (error) throw databaseError(error);
}

export async function discardAppTermsDraft(client: Client): Promise<void> {
  const { error } = await client.rpc('discard_app_terms_draft');
  if (error) throw databaseError(error);
}

/**
 * Publishes the draft and returns its number. Only settings.organization may.
 * A correction (RAPP-696) keeps whoever accepted the version before it
 * covered; a new version asks every player again.
 */
export async function publishAppTermsDraft(
  client: Client,
  kind: SaveKind = 'new',
): Promise<number> {
  const { data, error } = await client.rpc('publish_app_terms_draft', {
    p_is_correction: kind === 'correction',
  });
  if (error) throw databaseError(error);
  return z.number().int().min(1).parse(data);
}

// Her acceptance ---------------------------------------------------------------------------------

/** Whether she joined and has not accepted the current version yet. */
export async function fetchTermsAcceptanceNeeded(client: Client): Promise<boolean> {
  const { data, error } = await client.rpc('my_terms_acceptance_needed');
  if (error) throw databaseError(error);
  return z.boolean().parse(data ?? false);
}

export interface AcceptCurrentAppTermsInput {
  readonly versionId: string;
  readonly localeShown: LanguageCode;
  /**
   * What she gave on the terms form (`appTermsSubmission`): her answers, her
   * consents and her signatures (RAPP-772); for an older server, the old
   * acceptance, photo choice and signature.
   */
  readonly signing: Readonly<Record<string, unknown>>;
}

/** She accepts the current version again, from the terms screen alone. */
export async function acceptCurrentAppTerms(
  client: Client,
  input: AcceptCurrentAppTermsInput,
): Promise<void> {
  const { error } = await client.rpc('accept_current_app_terms', {
    p_version_id: z.uuid().parse(input.versionId),
    p_locale_shown: input.localeShown,
    p_signing: input.signing as Json,
  });
  if (error) throw databaseError(error);
}
