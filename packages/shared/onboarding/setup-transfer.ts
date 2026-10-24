/**
 * Moving the onboarding setup between organizations (RAPP-621): staging,
 * where Marc designs it, to production, created at launch.
 *
 * The database writes the file (`export_onboarding_setup`) and reads it
 * (`preview_onboarding_setup_import`, `import_onboarding_setup`). This module
 * is the shared Zod schema of that file: the admin reads a chosen file with it
 * before anything is sent, and the database checks it again. The file holds
 * the organization's configuration only: no person, answer, consent,
 * signature, audit row or test fixture, and an extra key is refused.
 *
 * The file sent to the database is the one read from disk, never the parsed
 * copy, so Zod's output shape can never change what is imported.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authorizationContentSchema } from '../authorization/authorization';
import { AppError, databaseErrorCode } from '../errors';
import { languageCodeSchema } from '../schemas/language';
import type { Database, Json } from '../types/database';
import { appTermsDraftSchema } from './app-terms';

type Client = SupabaseClient<Database>;

export const ONBOARDING_SETUP_FORMAT = 'ramassa.onboarding-setup';
/**
 * The schema version this build writes: 3 carries the profile layout alone
 * (RAPP-656). Version 2 added it beside the old question shape (RAPP-649).
 */
export const ONBOARDING_SETUP_SCHEMA_VERSION = 3;
/** The versions this build reads: the database reads a version 1 or 2 file as version 3. */
export const ONBOARDING_SETUP_READABLE_VERSIONS: readonly number[] = [1, 2, 3];

/** Text in any of the five languages (help lines, intros, overrides). */
const anyLanguageText = z.partialRecord(languageCodeSchema, z.string());
/** Text whose Catalan is required (titles, labels). */
const catalanText = anyLanguageText.refine((text) => (text.ca ?? '').trim().length > 0, {
  message: 'Catalan is required',
});
const configId = z.uuid();
/** The summary, the terms and the authorization always end the onboarding. */
const FLOW_ORDER_END_STEPS: ReadonlySet<string> = new Set([
  'summary',
  'terms-intro',
  'terms',
  'authorization',
]);
const position = z.number().int();

const optionSchema = z.strictObject({
  id: configId,
  label: catalanText,
  sort_order: position,
  is_archived: z.boolean(),
});

/** A question on a screen, in a version 1 or 2 file: version 3 has fields and placements. */
const olderQuestionSchema = z.strictObject({
  id: configId,
  question_type: z.string().min(1),
  label: catalanText,
  help: anyLanguageText.nullable(),
  privacy: z.enum(['normal', 'personal', 'sensitive']),
  placements: z.array(z.enum(['wizard', 'entity_form', 'season', 'staff'])).min(1),
  settings: z.record(z.string(), z.unknown()),
  is_required: z.boolean(),
  sort_order: position,
  is_archived: z.boolean(),
  show_when_question_id: configId.nullable(),
  show_when_option_id: configId.nullable(),
  options: z.array(optionSchema),
});

const screenSchema = z.strictObject({
  id: configId,
  title: catalanText,
  intro: anyLanguageText.nullable(),
  after_screen: z.string().min(1),
  sort_order: position,
  home_after_screen: z.string().min(1),
  home_sort_order: position,
  is_archived: z.boolean(),
  // A version 1 or 2 file only: the app screen a holder held (RAPP-642), and
  // the screen's questions. The database reads them as fields and placements.
  builtin_screen: z.string().min(1).nullable().optional(),
  questions: z.array(olderQuestionSchema).optional(),
});

export const onboardingSetupDocumentSchema = z
  .strictObject({
    format: z.literal(ONBOARDING_SETUP_FORMAT),
    schema_version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    app_commit: z.string().max(64).nullable(),
    exported_at: z.string().min(1),
    screens: z.array(screenSchema),
    // The profile layout (RAPP-649), from version 2 on; the database checks each row.
    sections: z.array(z.record(z.string(), z.unknown())).optional(),
    fields: z
      .array(
        z.looseObject({ kind: z.string(), options: z.array(z.record(z.string(), z.unknown())) }),
      )
      .optional(),
    placements: z.array(z.record(z.string(), z.unknown())).optional(),
    builtin_question_overrides: z.array(
      z.strictObject({
        question: z.string().min(1),
        label: anyLanguageText.nullable(),
        help: anyLanguageText.nullable(),
        is_hidden: z.boolean(),
        option_overrides: z.record(z.string(), z.unknown()),
      }),
    ),
    builtin_screens: z.array(
      z.strictObject({
        screen: z.string().min(1),
        texts: z.record(z.string(), z.unknown()),
        is_hidden: z.boolean(),
      }),
    ),
    flow_order: z.array(z.string().min(1)).max(200).nullable(),
    required_questions: z.array(
      z.strictObject({ question: z.string().min(1), is_required: z.boolean() }),
    ),
    presets: z.array(
      z.strictObject({
        name: z.string().trim().min(1).max(80),
        states: z.record(z.string(), z.enum(['ask', 'skip'])),
      }),
    ),
    document_step_explanation: catalanText.nullable(),
    app_terms: z.strictObject({
      published: z.array(
        z.strictObject({
          version_number: z.number().int().min(1),
          published_at: z.string().min(1),
          content: appTermsDraftSchema,
        }),
      ),
      draft: z.strictObject({ content: appTermsDraftSchema }).nullable(),
    }),
    seasons: z.array(
      z.strictObject({
        id: configId,
        name: z.string().trim().min(1).max(50),
        starts_on: z.iso.date(),
        is_current: z.boolean(),
      }),
    ),
    authorization: z.strictObject({
      published: z.array(
        z.strictObject({
          season_id: configId,
          version_number: z.number().int().min(1),
          published_at: z.string().min(1),
          content: authorizationContentSchema,
        }),
      ),
      draft: z.strictObject({ content: authorizationContentSchema }).nullable(),
    }),
  })
  .superRefine((document, context) => {
    if (
      document.schema_version >= 2 &&
      (document.sections === undefined ||
        document.fields === undefined ||
        document.placements === undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'the file carries the profile layout' });
    }
    if (
      document.schema_version === 1 &&
      document.screens.some((screen) => screen.questions === undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'a version 1 screen carries its questions' });
    }
    const screens = new Set(document.screens.map((screen) => screen.id));
    // A version 1 file's questions; a later file's are read from its fields.
    const questions =
      document.schema_version === 1
        ? document.screens.flatMap((screen) => screen.questions ?? [])
        : [];
    const questionIds = new Set(questions.map((question) => question.id));
    const optionIds = new Set(
      questions.flatMap((question) => question.options.map((option) => option.id)),
    );
    const seasons = new Set(document.seasons.map((season) => season.id));
    for (const question of questions) {
      if (
        (question.show_when_question_id === null) !== (question.show_when_option_id === null) ||
        (question.show_when_question_id !== null &&
          (!questionIds.has(question.show_when_question_id) ||
            !optionIds.has(question.show_when_option_id ?? '')))
      ) {
        context.addIssue({ code: 'custom', message: 'a condition points outside the file' });
      }
    }
    // The checks save_intake_flow_order makes (pending fix 31); the database
    // also checks that every built-in step exists.
    const archivedScreens = new Set(
      document.screens.filter((screen) => screen.is_archived).map((screen) => screen.id),
    );
    const flowOrder = document.flow_order ?? [];
    if (new Set(flowOrder).size !== flowOrder.length) {
      context.addIssue({ code: 'custom', message: 'the flow order names a step twice' });
    }
    for (const step of flowOrder) {
      if (FLOW_ORDER_END_STEPS.has(step)) {
        context.addIssue({ code: 'custom', message: 'the flow order names an end step' });
      }
      if (step.startsWith('custom:')) {
        const screenId = step.slice('custom:'.length);
        if (!screens.has(screenId)) {
          context.addIssue({ code: 'custom', message: 'the flow order names a missing screen' });
        } else if (archivedScreens.has(screenId)) {
          context.addIssue({ code: 'custom', message: 'the flow order names an archived screen' });
        }
      }
    }
    for (const version of document.authorization.published) {
      if (!seasons.has(version.season_id)) {
        context.addIssue({ code: 'custom', message: 'a version names a missing season' });
      }
    }
    if (document.seasons.filter((season) => season.is_current).length > 1) {
      context.addIssue({ code: 'custom', message: 'more than one current season' });
    }
  });
export type OnboardingSetupDocument = z.infer<typeof onboardingSetupDocumentSchema>;

export type OnboardingSetupFileRead =
  | {
      readonly ok: true;
      readonly document: OnboardingSetupDocument;
      /** The file as read: what is sent to the database. */
      readonly raw: Readonly<Record<string, unknown>>;
    }
  | { readonly ok: false; readonly reason: 'not_setup' }
  | { readonly ok: false; readonly reason: 'version_not_number' }
  | { readonly ok: false; readonly reason: 'unknown_version'; readonly version: unknown }
  | { readonly ok: false; readonly reason: 'damaged'; readonly issues: readonly string[] }
  | { readonly ok: false; readonly reason: 'empty' };

/**
 * Nothing in the file would be imported (pending fix 33). The database also
 * counts the bundled app terms version 1 as nothing, which it alone can
 * recognise, and refuses that file with `ONBOARDING_SETUP/EMPTY`.
 */
function holdsNoSetup(document: OnboardingSetupDocument): boolean {
  return (
    document.screens.length === 0 &&
    !(document.fields ?? []).some((field) => field.kind === 'custom') &&
    document.builtin_question_overrides.length === 0 &&
    document.builtin_screens.length === 0 &&
    (document.flow_order ?? []).length === 0 &&
    document.required_questions.length === 0 &&
    document.presets.length === 0 &&
    document.document_step_explanation === null &&
    document.app_terms.published.length === 0 &&
    document.app_terms.draft === null &&
    document.seasons.length === 0 &&
    document.authorization.published.length === 0 &&
    document.authorization.draft === null
  );
}

/** Reads a chosen file: an export of this schema version, or why not. */
export function readOnboardingSetupFile(text: string): OnboardingSetupFileRead {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_setup' };
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as { format?: unknown }).format !== ONBOARDING_SETUP_FORMAT
  ) {
    return { ok: false, reason: 'not_setup' };
  }
  const raw = value as Record<string, unknown>;
  // "1" as a string is not a version (pending fix 33).
  if (typeof raw.schema_version !== 'number') return { ok: false, reason: 'version_not_number' };
  if (!ONBOARDING_SETUP_READABLE_VERSIONS.includes(raw.schema_version)) {
    return { ok: false, reason: 'unknown_version', version: raw.schema_version };
  }
  const parsed = onboardingSetupDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'damaged',
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  if (holdsNoSetup(parsed.data)) return { ok: false, reason: 'empty' };
  return { ok: true, document: parsed.data, raw };
}

/** `ramassa-onboarding-setup-2026-10-22.json`. */
export function onboardingSetupFileName(when: Date): string {
  return `ramassa-onboarding-setup-${when.toISOString().slice(0, 10)}.json`;
}

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** The organization's setup, as one file. Designers and admins only. */
export async function exportOnboardingSetup(
  client: Client,
  appCommit: string | null,
): Promise<OnboardingSetupDocument> {
  const { data, error } = await client.rpc('export_onboarding_setup', {
    p_app_commit: appCommit ?? undefined,
  });
  if (error) throw databaseError(error);
  return onboardingSetupDocumentSchema.parse(data);
}

const countsSchema = z.record(z.string(), z.number().int().min(0));

const warningSchema = z.object({
  code: z.string().min(1),
  count: z.number().int().optional(),
  hosts: z.array(z.string()).optional(),
});
export type OnboardingSetupWarning = z.infer<typeof warningSchema>;

const legalPlanSchema = z.object({
  /** draft, published, bundled (unchanged version 1, already there) or none. */
  source: z.enum(['draft', 'published', 'bundled', 'none']),
  version_number: z.number().int().nullable().optional(),
  season_name: z.string().nullable().optional(),
  /** Saved as a draft in the organization, for an admin to publish. */
  imported: z.boolean(),
});
const legalSchema = z
  .object({ app_terms: legalPlanSchema, authorization: legalPlanSchema })
  .transform((legal) => ({ appTerms: legal.app_terms, authorization: legal.authorization }));

const previewSchema = z
  .object({
    can_import: z.boolean(),
    blockers: z.array(z.string()),
    problem: z.string().nullable(),
    schema_version: z.number().int(),
    app_commit: z.string().nullable(),
    exported_at: z.string().nullable(),
    counts: countsSchema,
    warnings: z.array(warningSchema),
    legal: legalSchema,
  })
  .transform((row) => ({
    canImport: row.can_import,
    /** What the organization already has, by kind: any blocks the import. */
    blockers: row.blockers,
    /** Why the database would refuse this file, when it would. */
    problem: row.problem,
    appCommit: row.app_commit,
    exportedAt: row.exported_at,
    counts: row.counts,
    warnings: row.warnings,
    legal: row.legal,
  }));
export type OnboardingSetupPreview = z.infer<typeof previewSchema>;

/** What the import would create and what stops it. Writes nothing. Admins only. */
export async function previewOnboardingSetupImport(
  client: Client,
  raw: Readonly<Record<string, unknown>>,
): Promise<OnboardingSetupPreview> {
  const { data, error } = await client.rpc('preview_onboarding_setup_import', {
    p_document: raw as Json,
  });
  if (error) throw databaseError(error);
  return previewSchema.parse(data);
}

const reportSchema = z
  .object({ counts: countsSchema, legal: legalSchema, warnings: z.array(warningSchema) })
  .transform((row) => ({ counts: row.counts, legal: row.legal, warnings: row.warnings }));
export type OnboardingSetupImportReport = z.infer<typeof reportSchema>;

/** Imports the file into the admin's organization, once. Admins only. */
export async function importOnboardingSetup(
  client: Client,
  raw: Readonly<Record<string, unknown>>,
): Promise<OnboardingSetupImportReport> {
  const { data, error } = await client.rpc('import_onboarding_setup', { p_document: raw as Json });
  if (error) throw databaseError(error);
  return reportSchema.parse(data);
}
