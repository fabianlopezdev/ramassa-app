/**
 * The player profile layout (RAPP-649): what Ramassà knows about a player,
 * and where it asks.
 *
 *   - a **section** groups fields the way the team reads a profile (Identitat,
 *     Contacte, Origen...); staff rename and reorder them;
 *   - a **field** is one piece of information, defined once with its type and
 *     privacy level. Built-in fields are the app's own questions; custom fields
 *     are what staff add, and keep the id of the question they were;
 *   - a **placement** puts a field on a surface (her onboarding at one screen,
 *     the entity form, the season re-registration) with its order, whether it
 *     is required there and an optional wording per language. A field with no
 *     placement is filled in by the team only.
 *
 * `intake_catalog` sends `sections`, `fields` and `placements`; the database
 * checks every rule, and the functions below call its writers.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { INTAKE_QUESTIONS, type IntakeQuestion } from '../onboarding/intake';
import type { Database, Json } from '../types/database';
import {
  CUSTOM_QUESTION_TYPES,
  type CustomQuestionType,
  type QuestionPlacement,
} from './question-types';

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** Localized text as stored: any of the five languages. */
export const anyLanguageTextSchema = z.object({
  ca: z.string().optional(),
  es: z.string().optional(),
  en: z.string().optional(),
  ar: z.string().optional(),
  fa: z.string().optional(),
});
export type BuilderText = z.infer<typeof anyLanguageTextSchema>;

export const QUESTION_PRIVACY_LEVELS = ['normal', 'personal', 'sensitive'] as const;
export type QuestionPrivacy = (typeof QUESTION_PRIVACY_LEVELS)[number];

export const PROFILE_SURFACES = ['onboarding', 'entity_form', 'season'] as const;
export type ProfileSurface = (typeof PROFILE_SURFACES)[number];

export const PROFILE_FIELD_KINDS = ['builtin', 'custom'] as const;
export type ProfileFieldKind = (typeof PROFILE_FIELD_KINDS)[number];

// The catalog ----------------------------------------------------------------------------------

const sectionSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  title: anyLanguageTextSchema,
  sort_order: z.number().int(),
  is_builtin: z.boolean(),
});

const fieldOptionSchema = z.object({
  id: z.uuid(),
  label: anyLanguageTextSchema,
  sort_order: z.number().int(),
  is_archived: z.boolean(),
});

const fieldSchema = z.object({
  id: z.uuid(),
  section_id: z.uuid(),
  kind: z.enum(PROFILE_FIELD_KINDS),
  builtin_key: z.string().nullable(),
  question_type: z.enum(CUSTOM_QUESTION_TYPES),
  label: anyLanguageTextSchema,
  help: anyLanguageTextSchema.nullable(),
  privacy: z.enum(QUESTION_PRIVACY_LEVELS),
  default_required: z.boolean(),
  settings: z.unknown().optional(),
  show_when_field_id: z.uuid().nullable(),
  show_when_option_id: z.uuid().nullable(),
  sort_order: z.number().int(),
  is_archived: z.boolean(),
  created_at: z.string(),
  // Only for the people who design the layout.
  created_by: z.uuid().nullable().optional(),
  created_by_name: z.string().nullable().optional(),
  has_answers: z.boolean().nullable().optional(),
  options: z.array(fieldOptionSchema),
});

const placementSchema = z.object({
  id: z.uuid(),
  field_id: z.uuid(),
  surface: z.enum(PROFILE_SURFACES),
  screen_key: z.string().nullable(),
  sort_order: z.number().int(),
  required: z.boolean(),
  label_override: anyLanguageTextSchema.nullable(),
  help_override: anyLanguageTextSchema.nullable(),
});

export interface ProfileSection {
  readonly id: string;
  readonly key: string;
  readonly title: BuilderText;
  readonly isBuiltin: boolean;
}

export interface ProfileFieldOption {
  readonly id: string;
  readonly label: BuilderText;
  readonly isArchived: boolean;
}

export interface ProfileField {
  readonly id: string;
  readonly sectionId: string;
  readonly kind: ProfileFieldKind;
  /** The app's own question a built-in field is; null for a custom one. */
  readonly builtinKey: IntakeQuestion | null;
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  /** What a new placement of it starts from. */
  readonly defaultRequired: boolean;
  /** The type's settings as stored; `parseQuestionSettings` reads them. */
  readonly settings: unknown;
  readonly showWhen?: { readonly fieldId: string; readonly optionId: string };
  /** Its place in its section. */
  readonly sortOrder: number;
  readonly isArchived: boolean;
  readonly createdAt: string;
  /** Who created it, for the people who design the layout; null otherwise or unknown. */
  readonly createdBy: string | null;
  readonly createdByName: string | null;
  /** Whether anything was answered: its privacy level is then fixed. Null when not sent. */
  readonly hasAnswers: boolean | null;
  readonly options: readonly ProfileFieldOption[];
}

export interface FieldPlacement {
  readonly id: string;
  readonly fieldId: string;
  readonly surface: ProfileSurface;
  /** On onboarding: an app screen (`equipment`) or a Ramassà screen's id. */
  readonly screenKey: string | null;
  /** Its place on its surface (and screen). */
  readonly sortOrder: number;
  readonly required: boolean;
  readonly labelOverride: BuilderText | null;
  readonly helpOverride: BuilderText | null;
}

/** Sections, fields and placements, each list in its stored order. */
export interface ProfileLayout {
  readonly sections: readonly ProfileSection[];
  readonly fields: readonly ProfileField[];
  readonly placements: readonly FieldPlacement[];
}

export const EMPTY_PROFILE_LAYOUT: ProfileLayout = { sections: [], fields: [], placements: [] };

const layoutSchema = z.object({
  sections: z.array(sectionSchema),
  fields: z.array(fieldSchema),
  placements: z.array(placementSchema),
});

function byOrder<Row extends { readonly sort_order: number }>(rows: readonly Row[]): Row[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

function isIntakeQuestion(key: string | null): key is IntakeQuestion {
  return key !== null && (INTAKE_QUESTIONS as readonly string[]).includes(key);
}

/**
 * The layout from the catalog. An older server sends none: undefined, and the
 * readers fall back to the old question shape.
 */
export function parseProfileLayout(raw: {
  readonly sections?: unknown;
  readonly fields?: unknown;
  readonly placements?: unknown;
}): ProfileLayout | undefined {
  if (raw.sections === undefined || raw.fields === undefined || raw.placements === undefined) {
    return undefined;
  }
  const layout = layoutSchema.parse(raw);
  return {
    sections: byOrder(layout.sections).map((section) => ({
      id: section.id,
      key: section.key,
      title: section.title,
      isBuiltin: section.is_builtin,
    })),
    fields: byOrder(layout.fields).map((field) => ({
      id: field.id,
      sectionId: field.section_id,
      kind: field.kind,
      builtinKey: isIntakeQuestion(field.builtin_key) ? field.builtin_key : null,
      type: field.question_type,
      label: field.label,
      help: field.help,
      privacy: field.privacy,
      defaultRequired: field.default_required,
      settings: field.settings ?? {},
      ...(field.show_when_field_id !== null && field.show_when_option_id !== null
        ? { showWhen: { fieldId: field.show_when_field_id, optionId: field.show_when_option_id } }
        : {}),
      sortOrder: field.sort_order,
      isArchived: field.is_archived,
      createdAt: field.created_at,
      createdBy: field.created_by ?? null,
      createdByName: field.created_by_name ?? null,
      hasAnswers: field.has_answers ?? null,
      options: byOrder(field.options).map((option) => ({
        id: option.id,
        label: option.label,
        isArchived: option.is_archived,
      })),
    })),
    placements: byOrder(layout.placements).map((placement) => ({
      id: placement.id,
      fieldId: placement.field_id,
      surface: placement.surface,
      screenKey: placement.screen_key,
      sortOrder: placement.sort_order,
      required: placement.required,
      labelOverride: placement.label_override,
      helpOverride: placement.help_override,
    })),
  };
}

// Reading the layout ----------------------------------------------------------------------------

export function fieldById(layout: ProfileLayout, id: string): ProfileField | undefined {
  return layout.fields.find((field) => field.id === id);
}

/** The built-in field of one of the app's questions. */
export function builtinField(
  layout: ProfileLayout,
  question: IntakeQuestion,
): ProfileField | undefined {
  return layout.fields.find((field) => field.builtinKey === question);
}

/** A section's fields in their order; archived ones only when asked. */
export function fieldsOfSection(
  layout: ProfileLayout,
  sectionId: string,
  withArchived = false,
): readonly ProfileField[] {
  return layout.fields.filter(
    (field) => field.sectionId === sectionId && (withArchived || !field.isArchived),
  );
}

/** Every placement of one field. */
export function placementsOf(layout: ProfileLayout, fieldId: string): readonly FieldPlacement[] {
  return layout.placements.filter((placement) => placement.fieldId === fieldId);
}

/** The field's placement on a surface; a field is on each surface at most once. */
export function placementOn(
  layout: ProfileLayout,
  fieldId: string,
  surface: ProfileSurface,
): FieldPlacement | undefined {
  return layout.placements.find(
    (placement) => placement.fieldId === fieldId && placement.surface === surface,
  );
}

/**
 * The placements of live fields on a surface, in order: on onboarding, the
 * ones of one screen.
 */
export function placementsOnSurface(
  layout: ProfileLayout,
  surface: ProfileSurface,
  screenKey: string | null = null,
): readonly FieldPlacement[] {
  const live = new Set(layout.fields.filter((field) => !field.isArchived).map((field) => field.id));
  return layout.placements.filter(
    (placement) =>
      placement.surface === surface &&
      (surface !== 'onboarding' || placement.screenKey === screenKey) &&
      live.has(placement.fieldId),
  );
}

/** No surface asks it: the team fills it in on her page. */
export function isTeamOnly(layout: ProfileLayout, fieldId: string): boolean {
  return placementsOf(layout, fieldId).length === 0;
}

/**
 * The places of a field in the old question words (`wizard`, `entity_form`,
 * `season`, `staff` for none), for the readers that still take them.
 */
export function legacyPlacementsOf(
  layout: ProfileLayout,
  fieldId: string,
): readonly QuestionPlacement[] {
  const surfaces = new Set(placementsOf(layout, fieldId).map((placement) => placement.surface));
  if (surfaces.size === 0) return ['staff'];
  return [
    ...(surfaces.has('onboarding') ? (['wizard'] as const) : []),
    ...(surfaces.has('entity_form') ? (['entity_form'] as const) : []),
    ...(surfaces.has('season') ? (['season'] as const) : []),
  ];
}

const SCREEN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The Ramassà screen an onboarding placement names, or null for an app screen. */
export function ramassaScreenIdOf(screenKey: string | null): string | null {
  return screenKey !== null && SCREEN_ID_PATTERN.test(screenKey) ? screenKey : null;
}

/**
 * The wording she sees for a placement: its override in each language that
 * has one, else the field's own name and help in that language.
 */
export function placementWording(
  placement: FieldPlacement,
  field: ProfileField,
): { readonly label: BuilderText; readonly help: BuilderText | null } {
  const help =
    field.help === null && placement.helpOverride === null
      ? null
      : { ...(field.help ?? {}), ...(placement.helpOverride ?? {}) };
  return { label: { ...field.label, ...(placement.labelOverride ?? {}) }, help };
}

// Writing ---------------------------------------------------------------------------------------

/** Creates a section (id null) or renames one. */
export async function saveProfileSection(
  client: Client,
  id: string | null,
  title: BuilderText,
): Promise<string> {
  const { data, error } = await client.rpc('save_profile_section', {
    p_id: id as string,
    p_title: title as Json,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function reorderProfileSections(
  client: Client,
  ids: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('reorder_profile_sections', { p_ids: [...ids] });
  if (error) throw databaseError(error);
}

export interface ProfileFieldDraft {
  readonly id: string | null;
  /** Null keeps the field where it is. */
  readonly sectionId: string | null;
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly defaultRequired: boolean;
  readonly options: readonly { readonly id?: string; readonly label: BuilderText }[];
  readonly settings: Readonly<Record<string, unknown>>;
}

/** Creates or changes a field; where it is asked is the placements' business. */
export async function saveProfileField(client: Client, draft: ProfileFieldDraft): Promise<string> {
  const { data, error } = await client.rpc('save_profile_field', {
    p_id: draft.id as string,
    p_section_id: draft.sectionId as string,
    p_type: draft.type,
    p_label: draft.label as Json,
    p_help: draft.help as Json,
    p_privacy: draft.privacy,
    p_default_required: draft.defaultRequired,
    p_options: [...draft.options] as Json,
    p_settings: draft.settings as Json,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function archiveProfileField(client: Client, id: string): Promise<void> {
  const { error } = await client.rpc('archive_profile_field', { p_id: id });
  if (error) throw databaseError(error);
}

/** Moves a field into a section; `order` is that section's fields, the moved one included. */
export async function moveProfileField(
  client: Client,
  id: string,
  sectionId: string,
  order: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('move_profile_field', {
    p_id: id,
    p_section_id: sectionId,
    p_ids: [...order],
  });
  if (error) throw databaseError(error);
}

/** Puts a field on a surface (and screen, for onboarding). Returns the placement id. */
export async function placeField(
  client: Client,
  fieldId: string,
  surface: ProfileSurface,
  screenKey: string | null = null,
  required: boolean | null = null,
): Promise<string> {
  const { data, error } = await client.rpc('place_field', {
    p_field_id: fieldId,
    p_surface: surface,
    p_screen_key: screenKey as string,
    p_required: required as boolean,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function removePlacement(client: Client, placementId: string): Promise<void> {
  const { error } = await client.rpc('remove_placement', { p_placement_id: placementId });
  if (error) throw databaseError(error);
}

export async function reorderPlacements(
  client: Client,
  surface: ProfileSurface,
  screenKey: string | null,
  ids: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('reorder_placements', {
    p_surface: surface,
    p_screen_key: screenKey as string,
    p_ids: [...ids],
  });
  if (error) throw databaseError(error);
}

/** Required on this surface and the wording per language; null leaves the field's own. */
export async function savePlacement(
  client: Client,
  placementId: string,
  change: {
    readonly required: boolean;
    readonly labelOverride: BuilderText | null;
    readonly helpOverride: BuilderText | null;
  },
): Promise<void> {
  const { error } = await client.rpc('save_placement', {
    p_placement_id: placementId,
    p_required: change.required,
    p_label_override: change.labelOverride as Json,
    p_help_override: change.helpOverride as Json,
  });
  if (error) throw databaseError(error);
}
