/**
 * Ramassà's participation authorization, signed in the app (RAPP-304), fully
 * editable per version (RAPP-614).
 *
 * Staff publish a version per season. Every player signs the latest version of
 * the current season, or has a paper record for that season; until then her
 * app shows only the authorization screen. She ticks each consent, answers the
 * questions the version asks and draws her signature, or signs with the ticks
 * alone when she cannot draw, and the record says so.
 *
 * A version holds everything she reads and answers: the text, the consents
 * (staff add, remove, reword, reorder and mark required), the health question
 * and the emergency contact (asked or not, required or not, their privacy
 * level and wording), and the wording of the form itself. A wording field
 * left out shows the app's own text in her language. The database checks the
 * same rules (`private.authorization_content_valid`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { signatureStrokesSchema, type SignatureStrokes } from '../equipment/handover';
import { AppError, databaseErrorCode } from '../errors';
import { withCancellation, type CancellableRequest } from '../lib/cancellation';
import type { LanguageCode } from '../schemas/language';
import { trimPersonName } from '../schemas/person-name';
import type { Database, Json } from '../types/database';

type Client = SupabaseClient<Database>;

/** A consent's stable key: what her records point at across versions. */
export type AuthorizationConsentKey = string;
export const consentKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

/** Image rights drive the photo consent (`media_consent_at`), so they are never required. */
export const IMAGE_RIGHTS_CONSENT = 'image_rights';
/** The explicit consent her health answer needs (GDPR art. 9). */
export const HEALTH_DATA_CONSENT = 'health_data';

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

/**
 * The authorization's screens staff may reorder (RAPP-696), in their default
 * order. The consents and signature screen always ends the form.
 */
export const AUTHORIZATION_MOVABLE_SCREENS = ['document', 'health'] as const;

export type AuthorizationMovableScreen = (typeof AUTHORIZATION_MOVABLE_SCREENS)[number];

/** A wording override: as above, at most 2000 characters per language. */
const overrideTextSchema = authorizationTextSchema.refine((text) =>
  Object.values(text).every((value) => (value ?? '').length <= 2000),
);

/**
 * The wording fields staff may set, by part. The database lists the same
 * fields in the block marked `authorization-text-fields` (a test reads it).
 */
export const AUTHORIZATION_TEXT_FIELDS = {
  texts: [
    'intro',
    'flow_label',
    'documents_title',
    'health_title',
    'consents_title',
    'continue_label',
    'sign_and_enter_label',
    'sign_label',
    'required_mark',
    'signature_title',
    'signature_prompt',
    'signature_hint',
    'cannot_draw_label',
    'cannot_draw_hint',
    'reregistration_title',
    'reregistration_intro',
    'reregistration_correct_label',
    'reregistration_edit_label',
    'reregistration_season_intro',
  ],
  health: ['question', 'no_label', 'yes_label', 'details_label'],
  emergency_contact: ['title', 'name_label', 'relation_label', 'phone_label'],
} as const;

export type AuthorizationTextField = (typeof AUTHORIZATION_TEXT_FIELDS.texts)[number];
export type HealthTextField = (typeof AUTHORIZATION_TEXT_FIELDS.health)[number];
export type EmergencyTextField = (typeof AUTHORIZATION_TEXT_FIELDS.emergency_contact)[number];

/**
 * The app's own text for each field, as `onboarding` translation keys: what
 * she reads when staff wrote nothing in her language. `{{season}}` is filled
 * in staff text too.
 */
export const AUTHORIZATION_BUNDLED_TEXT_KEYS = {
  texts: {
    intro: 'authorizationIntro',
    flow_label: 'seasonAuthorizationFlow',
    documents_title: 'authorizationDocumentsTitle',
    health_title: 'authorizationHealthTitle',
    consents_title: 'authorizationConsentsTitle',
    continue_label: 'continueAction',
    sign_and_enter_label: 'authorizationSignAndEnterAction',
    sign_label: 'authorizationSignAction',
    required_mark: 'authorizationRequiredMark',
    signature_title: 'authorizationSignatureTitle',
    signature_prompt: 'authorizationSignaturePrompt',
    signature_hint: 'authorizationSignatureHint',
    cannot_draw_label: 'authorizationCannotDraw',
    cannot_draw_hint: 'authorizationCannotDrawHint',
    reregistration_title: 'reregistrationTitle',
    reregistration_intro: 'reregistrationReviewIntro',
    reregistration_correct_label: 'reregistrationCorrect',
    reregistration_edit_label: 'reregistrationEdit',
    reregistration_season_intro: 'seasonStepIntro',
  },
  health: {
    question: 'authorizationHealthQuestion',
    no_label: 'authorizationHealthNo',
    yes_label: 'authorizationHealthYes',
    details_label: 'authorizationHealthLabel',
  },
  emergency_contact: {
    // A required contact drops the "(optional)" of the app's title.
    title: 'authorizationEmergencyTitle',
    name_label: 'authorizationEmergencyName',
    relation_label: 'authorizationEmergencyRelation',
    phone_label: 'authorizationEmergencyPhone',
  },
} as const satisfies {
  readonly texts: Record<AuthorizationTextField, string>;
  readonly health: Record<HealthTextField, string>;
  readonly emergency_contact: Record<EmergencyTextField, string>;
};

/** The app's title for a required emergency contact, without "(optional)". */
export const EMERGENCY_TITLE_REQUIRED_KEY = 'authorizationEmergencyTitleRequired';

const textsOf = <Field extends string>(fields: readonly Field[]) =>
  z
    .object(
      Object.fromEntries(fields.map((field) => [field, overrideTextSchema.optional()])) as Record<
        Field,
        z.ZodOptional<typeof overrideTextSchema>
      >,
    )
    .strict();

const consentSchema = z.object({
  label: authorizationTextSchema,
  required: z.boolean(),
  position: z.number().int().min(0).max(999),
});

export type AuthorizationConsent = z.infer<typeof consentSchema>;

const healthQuestionSchema = z.object({
  asked: z.boolean(),
  required: z.boolean(),
  /** Readable only with participants.view_health, always. */
  privacy: z.literal('health'),
  texts: textsOf(AUTHORIZATION_TEXT_FIELDS.health),
});

const emergencyQuestionSchema = z.object({
  asked: z.boolean(),
  required: z.boolean(),
  /** Her contact's name and relation at this level; the phone is always sensitive. */
  privacy: z.enum(['personal', 'sensitive']),
  texts: textsOf(AUTHORIZATION_TEXT_FIELDS.emergency_contact),
});

export type EmergencyContactPrivacy = z.infer<typeof emergencyQuestionSchema>['privacy'];

export const authorizationContentSchema = z
  .object({
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
    consents: z.record(consentKeySchema, consentSchema),
    questions: z.object({
      health: healthQuestionSchema,
      emergency_contact: emergencyQuestionSchema,
    }),
    texts: textsOf(AUTHORIZATION_TEXT_FIELDS.texts),
    attachments: z
      .array(z.object({ label: authorizationTextSchema, url: z.url().startsWith('https://') }))
      .max(10)
      .default([]),
    /** The movable screens' order (RAPP-696); absent is the document, then health. */
    screen_order: z
      .array(z.enum(AUTHORIZATION_MOVABLE_SCREENS))
      .length(2)
      .refine((order) => new Set(order).size === order.length, 'each screen once')
      .optional(),
  })
  .superRefine((content, context) => {
    const entries = Object.entries(content.consents);
    if (entries.length < 1 || entries.length > 20) {
      context.addIssue({ code: 'custom', path: ['consents'], message: '1 to 20 consents' });
    }
    if (new Set(entries.map(([, consent]) => consent.position)).size !== entries.length) {
      context.addIssue({ code: 'custom', path: ['consents'], message: 'one place per consent' });
    }
    if (content.consents[IMAGE_RIGHTS_CONSENT]?.required === true) {
      context.addIssue({
        code: 'custom',
        path: ['consents', IMAGE_RIGHTS_CONSENT, 'required'],
        message: 'image rights are optional',
      });
    }
    for (const part of ['health', 'emergency_contact'] as const) {
      const question = content.questions[part];
      if (!question.asked && question.required) {
        context.addIssue({
          code: 'custom',
          path: ['questions', part, 'required'],
          message: 'a hidden question is not required',
        });
      }
    }
    const health = content.questions.health;
    const healthConsent = content.consents[HEALTH_DATA_CONSENT];
    if (
      health.asked &&
      (healthConsent === undefined || (health.required && !healthConsent.required))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['consents', HEALTH_DATA_CONSENT],
        message: 'the health question needs its consent',
      });
    }
  });

export type AuthorizationContent = z.infer<typeof authorizationContentSchema>;

/** The version's consents in signing order. */
export function orderedConsents(
  content: AuthorizationContent,
): readonly (AuthorizationConsent & { readonly key: AuthorizationConsentKey })[] {
  return Object.entries(content.consents)
    .map(([key, consent]) => ({ key, ...consent }))
    .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key));
}

/**
 * The authorization's screens her form walks, in order (RAPP-696): the
 * document and the health screen in the version's order, then the consents
 * and her signature, always last.
 */
export function authorizationScreenOrder(
  content: Pick<AuthorizationContent, 'screen_order'>,
): readonly (AuthorizationMovableScreen | 'consents')[] {
  return [...(content.screen_order ?? AUTHORIZATION_MOVABLE_SCREENS), 'consents'];
}

/** The health and emergency phase shows while the version asks either question. */
export function isMiddlePhaseShown(content: AuthorizationContent): boolean {
  return content.questions.health.asked || content.questions.emergency_contact.asked;
}

/** A key for a consent staff add, used by no consent of the version. */
export function newConsentKey(content: AuthorizationContent): AuthorizationConsentKey {
  let number = Object.keys(content.consents).length + 1;
  while (`consent_${number}` in content.consents) number += 1;
  return `consent_${number}`;
}

/**
 * Staff wording of a field in her language, or undefined: the caller shows
 * the app's own text in her language then, so a screen is never blank.
 */
export function authorizationWording(
  texts: Readonly<Partial<Record<string, AuthorizationText | undefined>>> | undefined,
  field: string,
  language: LanguageCode,
): string | undefined {
  const text = texts?.[field]?.[language]?.trim();
  return text === undefined || text === '' ? undefined : text;
}

const statusRowSchema = z.object({
  required: z.boolean(),
  version_id: z.uuid(),
  season_id: z.uuid(),
  season_name: z.string(),
  // Null for the draft a test player is shown (RAPP-619).
  version_number: z.number().int().nullable(),
  content: authorizationContentSchema,
  // Returning: she signed an earlier season (RAPP-306). Older servers omit it.
  is_returning: z.boolean().optional().default(false),
  is_draft: z.boolean().optional().default(false),
});

export interface AuthorizationStatus {
  readonly required: boolean;
  readonly versionId: string;
  readonly seasonId: string;
  readonly seasonName: string;
  /** Null for a draft. */
  readonly versionNumber: number | null;
  readonly content: AuthorizationContent;
  /** She signed an earlier season: this is re-registration (RAPP-306). */
  readonly isReturning: boolean;
  /** A test player is shown the organization's draft (RAPP-619). */
  readonly isDraft: boolean;
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
    isDraft: row.is_draft,
  };
}

/** The gate: she sees only the authorization screen until she signs. */
export function needsAuthorization(status: AuthorizationStatus | null): boolean {
  return status?.required === true;
}

/** What she gives when she signs, before the version's own rules. */
const signingShape = z.object({
  // Partial: an optional consent she never touched is simply absent.
  consents: z.partialRecord(consentKeySchema, z.boolean()),
  healthInfo: z.string().trim().max(4000),
  emergencyContact: z
    .object({
      // A name of only invisible characters is no name (RAPP-624).
      name: z.string().overwrite(trimPersonName).max(200),
      relation: z.string().trim().max(100),
      phone: z.string().trim().max(50),
    })
    .optional(),
  strokes: signatureStrokesSchema.nullable(),
  unableToDraw: z.boolean(),
});

export type AuthorizationSigning = z.infer<typeof signingShape>;

/**
 * Her signing, checked against the version she signs: its required consents,
 * its questions, and the health data consent her health answer needs. The
 * database checks the same (`private.validate_signing_payload`).
 */
export function authorizationSigningSchemaFor(content: AuthorizationContent) {
  const { health, emergency_contact: contact } = content.questions;
  return signingShape.superRefine((signing, context) => {
    for (const consent of orderedConsents(content)) {
      if (consent.required && signing.consents[consent.key] !== true) {
        context.addIssue({ code: 'custom', path: ['consents', consent.key], message: 'required' });
      }
    }
    for (const key of Object.keys(signing.consents)) {
      if (!(key in content.consents)) {
        context.addIssue({
          code: 'custom',
          path: ['consents', key],
          message: 'not in the version',
        });
      }
    }
    if (health.asked) {
      if (health.required && signing.healthInfo === '') {
        context.addIssue({ code: 'custom', path: ['healthInfo'], message: 'required' });
      }
      if (
        signing.healthInfo !== '' &&
        HEALTH_DATA_CONSENT in content.consents &&
        signing.consents[HEALTH_DATA_CONSENT] !== true
      ) {
        context.addIssue({
          code: 'custom',
          path: ['consents', HEALTH_DATA_CONSENT],
          message: 'the health answer needs its consent',
        });
      }
    }
    if (
      contact.asked &&
      contact.required &&
      ((signing.emergencyContact?.name ?? '') === '' ||
        (signing.emergencyContact?.phone ?? '') === '')
    ) {
      context.addIssue({ code: 'custom', path: ['emergencyContact'], message: 'name and phone' });
    }
    const hasDrawing = signing.strokes !== null && signing.strokes.length > 0;
    if (hasDrawing === signing.unableToDraw) {
      context.addIssue({ code: 'custom', path: ['strokes'], message: 'draw or say you cannot' });
    }
  });
}

/** The payload: every consent of the version, ticked or not, and only those. */
export function buildSignPayload(
  signing: AuthorizationSigning,
  context: { readonly language: LanguageCode; readonly device: string | null },
  content: AuthorizationContent,
): Json {
  return {
    consents: Object.fromEntries(
      orderedConsents(content).map(({ key }) => [key, signing.consents[key] === true]),
    ),
    health_info:
      content.questions.health.asked && signing.healthInfo !== '' ? signing.healthInfo : null,
    emergency_contact: content.questions.emergency_contact.asked
      ? (signing.emergencyContact ?? null)
      : null,
    signature: signing.unableToDraw ? null : ((signing.strokes as Json | null) ?? null),
    unable_to_draw: signing.unableToDraw,
    language: context.language,
    device: context.device,
  };
}

export async function signAuthorization(
  client: Client,
  versionId: string,
  content: AuthorizationContent,
  signing: AuthorizationSigning,
  context: { readonly language: LanguageCode; readonly device: string | null },
): Promise<void> {
  const { error } = await client.rpc('sign_authorization', {
    p_version_id: versionId,
    p_payload: buildSignPayload(signing, context, content),
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
}

/** One of her consents as it stands, with the words she was shown. */
export interface MyConsent {
  readonly granted: boolean;
  /** The consent's words when she decided, in `language`; null outside the authorization. */
  readonly wording: string | null;
}

/** Her consents as they stand; a consent never given is absent. */
export async function fetchMyConsents(
  client: Client,
): Promise<Readonly<Record<AuthorizationConsentKey, MyConsent>>> {
  const { data, error } = await client.rpc('my_consents');
  if (error) throw new AppError('DB-1', { message: error.message });
  const rows = z
    .array(
      z.object({
        consent_key: z.string(),
        granted: z.boolean(),
        wording: z.string().nullable().optional().default(null),
      }),
    )
    .parse(data ?? []);
  return Object.fromEntries(
    rows.map((row) => [row.consent_key, { granted: row.granted, wording: row.wording }]),
  );
}

/**
 * An optional consent of the current version, or withdrawing any consent she
 * gave that it does not require. `language` is the one her screen showed.
 */
export async function setOptionalConsent(
  client: Client,
  key: AuthorizationConsentKey,
  granted: boolean,
  language: LanguageCode,
): Promise<void> {
  const { error } = await client.rpc('set_optional_consent', {
    p_key: key,
    p_granted: granted,
    p_language: language,
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
}

// Staff ---------------------------------------------------------------------------------------

const versionRowSchema = z.object({
  id: z.uuid(),
  season_id: z.uuid().nullable(),
  season_name: z.string().nullable(),
  version_number: z.number().int().nullable(),
  content: authorizationContentSchema,
  published_at: z.string().nullable(),
  is_current: z.boolean(),
  updated_at: z.string().optional(),
  is_correction: z.boolean().default(false),
  signature_count: z.number().int().default(0),
});

export interface AuthorizationVersion {
  readonly id: string;
  /** The season it was published for (RAPP-694). Null for the draft. */
  readonly seasonId: string | null;
  /** Null for the draft. */
  readonly seasonName: string | null;
  /** Null for the draft. */
  readonly versionNumber: number | null;
  readonly content: AuthorizationContent;
  /** Null for the draft. */
  readonly publishedAt: string | null;
  readonly isCurrent: boolean;
  readonly updatedAt: string | null;
  /** Published as a correction (RAPP-696): signatures on the version before it still count. */
  readonly isCorrection: boolean;
  /** Real players' signatures on this version (RAPP-696). */
  readonly signatureCount: number;
}

/** The draft first, then the published versions, newest first. */
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
      seasonId: row.season_id,
      seasonName: row.season_name,
      versionNumber: row.version_number,
      content: row.content,
      publishedAt: row.published_at,
      isCurrent: row.is_current,
      updatedAt: row.updated_at ?? null,
      isCorrection: row.is_correction,
      signatureCount: row.signature_count,
    }));
}

/** Saves the one draft (onboarding designers). */
export async function saveAuthorizationDraft(
  client: Client,
  content: AuthorizationContent,
): Promise<string> {
  const { data, error } = await client.rpc('save_authorization_draft', {
    p_content: content as unknown as Json,
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
  return z.string().parse(data);
}

export async function discardAuthorizationDraft(client: Client): Promise<void> {
  const { error } = await client.rpc('discard_authorization_draft');
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
}

/**
 * How a saved change reaches whoever already answered a form (RAPP-696): a
 * correction leaves them covered, a new version asks everyone again.
 */
export type SaveKind = 'correction' | 'new';

/**
 * Publishes the draft (settings.organization) for a season: the current one
 * when none is given, or a future one (RAPP-694). A new version makes every
 * player sign a current season's version on her next app open; a correction
 * (RAPP-696) keeps whoever signed the version before it covered. A future
 * season's version waits until that season is marked current. Returns its
 * number in its season.
 */
export async function publishAuthorizationDraft(
  client: Client,
  seasonId: string | null = null,
  kind: SaveKind = 'new',
): Promise<number> {
  const { data, error } = await client.rpc('publish_authorization_draft', {
    ...(seasonId === null ? {} : { p_season_id: seasonId }),
    p_is_correction: kind === 'correction',
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
  return z.number().int().parse(data);
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
  /** The words she was shown, in `language`; null for a change outside the authorization. */
  readonly wording: string | null;
  readonly language: string | null;
  readonly required: boolean | null;
  readonly seasonName: string | null;
  readonly versionNumber: number | null;
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
        consent_key: z.string(),
        granted: z.boolean(),
        decided_at: z.string(),
        method: z.string(),
        wording: z.string().nullable().optional().default(null),
        language: z.string().nullable().optional().default(null),
        required: z.boolean().nullable().optional().default(null),
        season_name: z.string().nullable().optional().default(null),
        version_number: z.number().int().nullable().optional().default(null),
      }),
    )
    .parse(data ?? [])
    .map((row) => ({
      key: row.consent_key,
      granted: row.granted,
      decidedAt: row.decided_at,
      method: row.method,
      wording: row.wording,
      language: row.language,
      required: row.required,
      seasonName: row.season_name,
      versionNumber: row.version_number,
    }));
}
