/**
 * Nou formulari (RAPP-700): the forms the team creates, designed on the same
 * board as Onboarding and answered with the same writers.
 *
 *   - Design: create a form with its name and three choices, give it screens,
 *     place fields, consents and signature blocks on them with the shared
 *     placement calls (surface `custom_form`, the screen's id), then publish it.
 *   - Her phone: her pending forms (`fetchMyCustomForms`), the ones that keep
 *     her from the app first; answering one (`completeCustomForm`) sends her
 *     answers by field, her signatures and her consent ticks; an optional one
 *     can be dismissed.
 *   - The team: who answered and who is pending (`fetchCustomFormResponses`),
 *     and her forms on her page.
 *   - Drafts (RAPP-701): every save is a draft; `publishCustomForm` makes it a
 *     version (Correcció or Nova versió, of a season when it repeats) and asks
 *     its audience (`setCustomFormRecipients` picks the players).
 *
 * Docs: https://zod.dev/api
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { NotificationAudience } from '../notifications';
import type { Database, Json } from '../types/database';
import {
  answerPayload,
  type CustomAnswerValue,
  type CustomQuestion,
  type IntakeCatalog,
} from './builder';
import { consentsOn, type PlacedConsent } from './consents';
import type {
  CustomForm,
  CustomFormAudience,
  CustomFormFiller,
  CustomFormMandatory,
} from './custom-form-model';
import { formBlocksOn, type FormBlock } from './form-blocks';
import { placedQuestion } from './her-onboarding';
import {
  anyLanguageTextSchema,
  fieldById,
  placementsOnSurface,
  type BuilderText,
} from './profile-layout';

export * from './custom-form-model';

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message), { message: error.message });
}

// Reading the catalog -------------------------------------------------------------------------------

/** A form of the catalog by id. */
export function customFormById(
  catalog: Pick<IntakeCatalog, 'customForms'>,
  id: string,
): CustomForm | undefined {
  return (catalog.customForms ?? []).find((form) => form.id === id);
}

/** The fields a form's screen asks, in their order, worded as each placement says. */
export function customFormScreenQuestions(
  catalog: IntakeCatalog,
  screenId: string,
): readonly CustomQuestion[] {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  return placementsOnSurface(layout, 'custom_form', screenId).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    return field === undefined ? [] : [placedQuestion(layout, field, placement)];
  });
}

/** The signature blocks of a form's screen, in order. */
export function customFormScreenBlocks(
  catalog: IntakeCatalog,
  screenId: string,
): readonly FormBlock[] {
  return formBlocksOn(catalog.blocks, 'custom_form', screenId);
}

/** The consents a form's screen asks, in order. */
export function customFormScreenConsents(
  catalog: IntakeCatalog,
  screenId: string,
): readonly PlacedConsent[] {
  return consentsOn(catalog, 'custom_form', screenId);
}

/** Whether a form keeps her from the app: required to use it, or required from a date that came. */
export function isBlockingForm(
  form: Pick<CustomForm, 'mandatory' | 'deadline'>,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  return (
    form.mandatory === 'required_to_use_app' ||
    (form.mandatory === 'required_from_date' && form.deadline !== null && form.deadline <= today)
  );
}

// Designing a form ------------------------------------------------------------------------------------

/** The name and the choices of a form (RAPP-701). */
export interface CustomFormChoices {
  readonly name: BuilderText;
  readonly filledBy: CustomFormFiller;
  readonly mandatory: CustomFormMandatory;
  /** YYYY-MM-DD; only with `required_from_date`. */
  readonly deadline: string | null;
  readonly audience: CustomFormAudience;
  readonly repeatsEachSeason: boolean;
}

function choicesArgs(choices: CustomFormChoices) {
  return {
    p_name: choices.name as Json,
    p_filled_by: choices.filledBy,
    p_mandatory: choices.mandatory,
    // The database takes a date only with its level.
    p_deadline: (choices.mandatory === 'required_from_date' ? choices.deadline : null) as string,
    p_audience: choices.audience,
    p_repeats_each_season: choices.repeatsEachSeason,
  };
}

export async function createCustomForm(
  client: Client,
  choices: CustomFormChoices,
): Promise<string> {
  const { data, error } = await client.rpc('create_custom_form', choicesArgs(choices));
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function saveCustomForm(
  client: Client,
  id: string,
  choices: CustomFormChoices,
): Promise<void> {
  const { error } = await client.rpc('save_custom_form', { p_id: id, ...choicesArgs(choices) });
  if (error) throw databaseError(error);
}

export async function archiveCustomForm(
  client: Client,
  id: string,
  isArchived: boolean,
): Promise<void> {
  const { error } = await client.rpc('archive_custom_form', { p_id: id, p_archived: isArchived });
  if (error) throw databaseError(error);
}

/**
 * Publica (RAPP-701): the draft becomes a version, a Correcció or a Nova
 * versió, of a season when the form repeats. Returns how many players were
 * asked now.
 */
export async function publishCustomForm(
  client: Client,
  id: string,
  publish: { readonly isCorrection: boolean; readonly seasonId: string | null },
): Promise<number> {
  const { data, error } = await client.rpc('publish_custom_form', {
    p_id: id,
    p_is_correction: publish.isCorrection,
    p_season_id: publish.seasonId as string,
  });
  if (error) throw databaseError(error);
  return z
    .number()
    .int()
    .parse(data ?? 0);
}

export async function saveCustomFormScreen(
  client: Client,
  screen: {
    readonly id: string | null;
    readonly formId: string;
    readonly title: BuilderText;
    readonly intro: BuilderText | null;
  },
): Promise<string> {
  const { data, error } = await client.rpc('save_custom_form_screen', {
    p_id: screen.id as string,
    p_form_id: screen.formId,
    p_title: screen.title as Json,
    p_intro: screen.intro as Json,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function archiveCustomFormScreen(client: Client, id: string): Promise<void> {
  const { error } = await client.rpc('archive_custom_form_screen', { p_id: id });
  if (error) throw databaseError(error);
}

export async function reorderCustomFormScreens(
  client: Client,
  formId: string,
  ids: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('reorder_custom_form_screens', {
    p_form_id: formId,
    p_ids: [...ids],
  });
  if (error) throw databaseError(error);
}

/** The players a form is for: picked one by one, or by a notification audience (a group...). */
export type CustomFormRecipients =
  NotificationAudience | { readonly kind: 'players'; readonly participantIds: readonly string[] };

/** Picks the players a form is for; the pick replaces the list. Returns how many are on it. */
export async function setCustomFormRecipients(
  client: Client,
  formId: string,
  recipients: CustomFormRecipients,
): Promise<number> {
  const config =
    recipients.kind === 'players'
      ? { participant_ids: [...recipients.participantIds] }
      : recipients.kind === 'all'
        ? {}
        : recipients.kind === 'interest'
          ? { service_category_id: recipients.serviceCategoryId }
          : recipients.kind === 'signup'
            ? { event_id: recipients.eventId }
            : recipients.kind === 'entity'
              ? { entity_name: recipients.entityName }
              : { custom_group_id: recipients.customGroupId };
  const { data, error } = await client.rpc('set_custom_form_recipients', {
    p_form_id: formId,
    p_audience_kind: recipients.kind,
    p_audience_config: config,
  });
  if (error) throw databaseError(error);
  return z
    .number()
    .int()
    .parse(data ?? 0);
}

// Her phone -----------------------------------------------------------------------------------------------

/** One form she still has to answer. */
export interface PendingCustomForm {
  readonly responseId: string;
  readonly formId: string;
  readonly version: number;
  readonly name: BuilderText;
  readonly mandatory: CustomFormMandatory;
  readonly deadline: string | null;
  /** It keeps her from the app until she answers. */
  readonly isBlocking: boolean;
}

const pendingSchema = z.object({
  response_id: z.uuid(),
  form_id: z.uuid(),
  version: z.number().int(),
  name: anyLanguageTextSchema,
  mandatory: z.enum(['optional', 'required_to_use_app', 'required_from_date']),
  deadline: z.string().nullable(),
  is_blocking: z.boolean(),
});

/** Her pending forms, the ones that keep her from the app first. A row this build cannot read is left out. */
export async function fetchMyCustomForms(client: Client): Promise<readonly PendingCustomForm[]> {
  const { data, error } = await client.rpc('my_custom_forms');
  if (error) throw databaseError(error);
  return (Array.isArray(data) ? data : []).flatMap((row): PendingCustomForm[] => {
    const parsed = pendingSchema.safeParse(row);
    if (!parsed.success) return [];
    const form = parsed.data;
    return [
      {
        responseId: form.response_id,
        formId: form.form_id,
        version: form.version,
        name: form.name,
        mandatory: form.mandatory,
        deadline: form.deadline,
        isBlocking: form.is_blocking,
      },
    ];
  });
}

/** What she sends when she answers a form. */
export interface CustomFormAnswers {
  readonly answers: Readonly<Record<string, CustomAnswerValue | null>>;
  /** By block id: her strokes and the language the text was shown in (`formSignaturesPayload`). */
  readonly signatures?: Json;
  /** Her ticks of the form's consents, by key, when it asks one. */
  readonly consents?: Readonly<Record<string, boolean>>;
  readonly language: string;
}

export async function completeCustomForm(
  client: Client,
  responseId: string,
  { answers, ...rest }: CustomFormAnswers,
): Promise<void> {
  const { error } = await client.rpc('complete_custom_form', {
    p_response_id: responseId,
    payload: { ...rest, answers: answerPayload(answers) } as unknown as Json,
  });
  if (error) throw databaseError(error);
}

/** An optional form she does not want to answer leaves her Home. */
export async function dismissCustomForm(client: Client, responseId: string): Promise<void> {
  const { error } = await client.rpc('dismiss_custom_form', { p_response_id: responseId });
  if (error) throw databaseError(error);
}

// The team ---------------------------------------------------------------------------------------------

export const CUSTOM_FORM_RESPONSE_STATUSES = ['pending', 'done', 'dismissed'] as const;
export type CustomFormResponseStatus = (typeof CUSTOM_FORM_RESPONSE_STATUSES)[number];

/** One ask of a form, for its Respostes tab. */
export interface CustomFormResponse {
  readonly responseId: string;
  readonly profileId: string;
  /** Her name as the reader may see it; null shows her number. */
  readonly displayName: string | null;
  readonly memberNumber: number | null;
  readonly status: CustomFormResponseStatus;
  readonly version: number;
  readonly seasonName: string | null;
  readonly askedAt: string;
  readonly answeredAt: string | null;
  readonly answeredByName: string | null;
  readonly filledBy: 'player' | 'team' | null;
}

const responseSchema = z.object({
  response_id: z.uuid(),
  profile_id: z.uuid(),
  display_name: z.string().nullable(),
  member_number: z.number().int().nullable(),
  status: z.enum(CUSTOM_FORM_RESPONSE_STATUSES),
  version: z.number().int(),
  season_name: z.string().nullable(),
  asked_at: z.string(),
  answered_at: z.string().nullable(),
  answered_by_name: z.string().nullable(),
  filled_by: z.enum(['player', 'team']).nullable(),
});

export async function fetchCustomFormResponses(
  client: Client,
  formId: string,
): Promise<readonly CustomFormResponse[]> {
  const { data, error } = await client.rpc('custom_form_responses_of', { p_form_id: formId });
  if (error) throw databaseError(error);
  return z
    .array(responseSchema)
    .parse(data ?? [])
    .map((row) => ({
      responseId: row.response_id,
      profileId: row.profile_id,
      displayName: row.display_name,
      memberNumber: row.member_number,
      status: row.status,
      version: row.version,
      seasonName: row.season_name,
      askedAt: row.asked_at,
      answeredAt: row.answered_at,
      answeredByName: row.answered_by_name,
      filledBy: row.filled_by,
    }));
}

/** One ask of a form on her page. */
export interface ParticipantCustomForm {
  readonly responseId: string;
  readonly formId: string;
  readonly name: BuilderText;
  readonly filledBy: CustomFormFiller;
  readonly status: CustomFormResponseStatus;
  readonly version: number;
  readonly mandatory: CustomFormMandatory;
  readonly deadline: string | null;
  readonly askedAt: string;
  readonly answeredAt: string | null;
}

const participantFormSchema = z.object({
  response_id: z.uuid(),
  form_id: z.uuid(),
  name: anyLanguageTextSchema,
  filled_by: z
    .enum(['player', 'team', 'entity'])
    .transform((value) => (value === 'team' ? 'player' : value)),
  status: z.enum(CUSTOM_FORM_RESPONSE_STATUSES),
  version: z.number().int(),
  mandatory: z.enum(['optional', 'required_to_use_app', 'required_from_date']),
  deadline: z.string().nullable(),
  asked_at: z.string(),
  answered_at: z.string().nullable(),
});

export async function fetchParticipantCustomForms(
  client: Client,
  profileId: string,
): Promise<readonly ParticipantCustomForm[]> {
  const { data, error } = await client.rpc('participant_custom_forms', {
    p_profile_id: profileId,
  });
  if (error) throw databaseError(error);
  return z
    .array(participantFormSchema)
    .parse(data ?? [])
    .map((row) => ({
      responseId: row.response_id,
      formId: row.form_id,
      name: row.name,
      filledBy: row.filled_by,
      status: row.status,
      version: row.version,
      mandatory: row.mandatory,
      deadline: row.deadline,
      askedAt: row.asked_at,
      answeredAt: row.answered_at,
    }));
}
