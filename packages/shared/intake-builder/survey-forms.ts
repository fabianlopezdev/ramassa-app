/**
 * Surveys on the form engine (RAPP-929).
 *
 * A survey is a form of the engine (`CustomForm.kind === 'survey'`): its
 * screens, board and editor are a form's. Two things differ, both kept by the
 * database (migration `20261123170000_surveys_on_the_form_engine.sql`):
 *
 *   - Its questions are its own (`ProfileField.kind === 'survey'`), in no
 *     section, and her answers are kept with the response, never on her
 *     record. The team builds them with `saveSurveyQuestion` and reads them
 *     with `fetchSurveyResults`; she answers with `completeSurvey`.
 *   - Installed builds never see a survey: `intake_catalog` leaves them out.
 *     The dashboard reads `fetchIntakeCatalogWithSurveys`; her phone reads
 *     `fetchMySurveys`, each survey as the version she was asked.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { Database, Json } from '../types/database';
import { parseIntakeCatalog, type IntakeCatalog } from './builder';
import type { BuilderText } from './profile-layout';
import type { CustomQuestionType } from './question-types';

type Client = SupabaseClient<Database>;

function failed(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** The dashboard's catalog: every form, the surveys and their questions too. */
export async function fetchIntakeCatalogWithSurveys(client: Client): Promise<IntakeCatalog> {
  const { data, error } = await client.rpc('intake_catalog_with_surveys');
  if (error) throw failed(error);
  return parseIntakeCatalog(data);
}

export interface SurveyQuestionDraft {
  /** Null for a new question, placed on `screenId`. */
  readonly id: string | null;
  readonly screenId: string;
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly required: boolean;
  readonly options: readonly { readonly id?: string; readonly label: BuilderText }[];
  readonly settings: Readonly<Record<string, unknown>>;
}

/** A survey's question, created on one of its screens or saved again. */
export async function saveSurveyQuestion(
  client: Client,
  draft: SurveyQuestionDraft,
): Promise<string> {
  const { data, error } = await client.rpc('save_survey_question', {
    p_id: draft.id as string,
    p_screen_id: draft.screenId,
    p_type: draft.type,
    p_label: draft.label as Json,
    p_help: draft.help as Json,
    p_required: draft.required,
    p_options: draft.options as unknown as Json,
    p_settings: draft.settings as Json,
  });
  if (error) throw failed(error);
  return z.uuid().parse(data);
}

/** A survey's activity and closing time (ISO); null clears either. */
export async function saveSurveySettings(
  client: Client,
  formId: string,
  settings: { readonly eventId: string | null; readonly closesAt: string | null },
): Promise<void> {
  const { error } = await client.rpc('save_survey_settings', {
    p_form_id: formId,
    p_event_id: settings.eventId as string,
    p_closes_at: settings.closesAt as string,
  });
  if (error) throw failed(error);
}

// Her surveys ------------------------------------------------------------------------------------

/** One survey waiting for her, as the version she was asked. */
export interface MySurvey {
  readonly responseId: string;
  readonly formId: string;
  readonly version: number;
  readonly name: BuilderText;
  readonly eventId: string | null;
  readonly closesAt: string | null;
  readonly askedAt: string;
  /** The version's content: its screens, placements and blocks, as `custom_form_versions` keeps them. */
  readonly content: unknown;
  /** She left it half way and her answers so far are kept (RAPP-945). */
  readonly isStarted: boolean;
}

const mySurveyRowSchema = z.object({
  response_id: z.uuid(),
  form_id: z.uuid(),
  version: z.number().int(),
  name: z.record(z.string(), z.string()).catch({}),
  event_id: z.uuid().nullable(),
  closes_at: z.string().nullable(),
  asked_at: z.string(),
  content: z.unknown(),
  // Older databases send no started flag: the survey then reads as not started.
  is_started: z.boolean().catch(false),
});

export async function fetchMySurveys(client: Client): Promise<readonly MySurvey[]> {
  const { data, error } = await client.rpc('my_surveys');
  if (error) throw failed(error);
  return (Array.isArray(data) ? data : []).flatMap((row): MySurvey[] => {
    const parsed = mySurveyRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const survey = parsed.data;
    return [
      {
        responseId: survey.response_id,
        formId: survey.form_id,
        version: survey.version,
        name: survey.name,
        eventId: survey.event_id,
        closesAt: survey.closes_at,
        askedAt: survey.asked_at,
        content: survey.content,
        isStarted: survey.is_started,
      },
    ];
  });
}

/** Her answers to a survey, by question id; an unanswered optional question is left out. */
export async function completeSurvey(
  client: Client,
  responseId: string,
  answers: Readonly<Record<string, unknown>>,
): Promise<void> {
  const { error } = await client.rpc('complete_survey', {
    p_response_id: responseId,
    p_answers: answers as Json,
  });
  if (error) throw failed(error);
}

// The results ------------------------------------------------------------------------------------

export interface SurveyResultRow {
  readonly responseId: string;
  readonly profileId: string;
  readonly displayName: string | null;
  readonly memberNumber: number | null;
  readonly version: number;
  readonly answeredAt: string | null;
  /** Her answers by question id. */
  readonly answers: Readonly<Record<string, unknown>>;
}

const resultRowSchema = z.object({
  response_id: z.uuid(),
  profile_id: z.uuid(),
  display_name: z.string().nullable(),
  member_number: z.number().int().nullable(),
  version: z.number().int(),
  answered_at: z.string().nullable(),
  answers: z.record(z.string(), z.unknown()).catch({}),
});

export async function fetchSurveyResults(
  client: Client,
  formId: string,
): Promise<readonly SurveyResultRow[]> {
  const { data, error } = await client.rpc('survey_results', { p_form_id: formId });
  if (error) throw failed(error);
  return (Array.isArray(data) ? data : []).flatMap((row): SurveyResultRow[] => {
    const parsed = resultRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const result = parsed.data;
    return [
      {
        responseId: result.response_id,
        profileId: result.profile_id,
        displayName: result.display_name,
        memberNumber: result.member_number,
        version: result.version,
        answeredAt: result.answered_at,
        answers: result.answers,
      },
    ];
  });
}

/** One question's answers, counted: by option, by rating, yes and no, or the texts. */
const surveyExportSchema = z.object({
  version: z.literal(1),
  export_id: z.uuid(),
  rows: z.array(z.unknown()),
});

/**
 * The rows of a survey's CSV (RAPP-946). It names every player who answered,
 * so the database asks for a recent authenticator code (AUTH-9 when it is
 * missing, so the step-up prompt can ask it) and writes the export to the
 * audit log, as the old survey export did (RAPP-402).
 */
export async function createSurveyResultsExport(
  client: Client,
  formId: string,
): Promise<readonly SurveyResultRow[]> {
  const { data, error } = await client.rpc('create_survey_results_export', {
    p_form_id: z.uuid().parse(formId),
  });
  if (error) throw failed(error);
  return surveyExportSchema.parse(data).rows.flatMap((row): SurveyResultRow[] => {
    const parsed = resultRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const result = parsed.data;
    return [
      {
        responseId: result.response_id,
        profileId: result.profile_id,
        displayName: result.display_name,
        memberNumber: result.member_number,
        version: result.version,
        answeredAt: result.answered_at,
        answers: result.answers,
      },
    ];
  });
}

export interface SurveyQuestionSummary {
  readonly fieldId: string;
  readonly answered: number;
  /** How many picked each value: an option id, a rating "1".."5", "yes"/"no"/"maybe". */
  readonly counts: Readonly<Record<string, number>>;
  /** The mean rating, for a rating question; null otherwise or with no answer. */
  readonly average: number | null;
  /** The written answers, for a text question. */
  readonly texts: readonly string[];
}

/** Each question's answers counted, for the results page. */
export function summarizeSurveyAnswers(
  questions: readonly { readonly fieldId: string; readonly type: CustomQuestionType }[],
  rows: readonly SurveyResultRow[],
): readonly SurveyQuestionSummary[] {
  return questions.map((question) => {
    const counts: Record<string, number> = {};
    const texts: string[] = [];
    let answered = 0;
    let total = 0;
    for (const row of rows) {
      const value = row.answers[question.fieldId];
      if (value === undefined || value === null) continue;
      answered += 1;
      const values = Array.isArray(value) ? value : [value];
      for (const each of values) {
        if (
          typeof each === 'string' &&
          (question.type === 'short_text' || question.type === 'long_text')
        ) {
          texts.push(each);
          continue;
        }
        const key = String(each);
        counts[key] = (counts[key] ?? 0) + 1;
        if (question.type === 'rating' && typeof each === 'number') total += each;
      }
    }
    return {
      fieldId: question.fieldId,
      answered,
      counts,
      average: question.type === 'rating' && answered > 0 ? total / answered : null,
      texts,
    };
  });
}

// Her phone walks a survey -----------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The catalog her phone walks a survey with: the catalog `intake_catalog` sent
 * (`raw`, which never holds a survey), with the survey as the version she was
 * asked. Its questions come from the version too, since a survey's questions
 * never reach that catalog either. Each frozen placement names its question's
 * type, settings, wording and options.
 */
export function surveyCatalog(raw: unknown, survey: MySurvey): IntakeCatalog {
  const base = isRecord(raw) ? raw : {};
  const content = isRecord(survey.content) ? survey.content : {};
  const screens = Array.isArray(content.screens) ? content.screens : [];
  const placements = Array.isArray(content.placements) ? content.placements.filter(isRecord) : [];
  const form = {
    id: survey.formId,
    name: survey.name,
    filled_by: 'player',
    mandatory: 'optional',
    deadline: null,
    audience: 'all',
    repeats_each_season: false,
    kind: 'survey',
    system_key: null,
    event_id: survey.eventId,
    closes_at: survey.closesAt,
    version: survey.version,
    published_at: survey.askedAt,
    is_archived: false,
    screens: screens.map((screen: unknown) =>
      isRecord(screen) ? { ...screen, is_hidden: false } : screen,
    ),
  };
  const fields = placements.flatMap((placement) => {
    const field = isRecord(placement.field) ? placement.field : null;
    if (field === null || typeof placement.field_id !== 'string') return [];
    const options = Array.isArray(field.options) ? field.options.filter(isRecord) : [];
    return [
      {
        id: placement.field_id,
        section_id: null,
        survey_form_id: survey.formId,
        kind: 'survey',
        system_key: null,
        question_type: field.question_type,
        label: field.label,
        help: field.help ?? null,
        privacy: 'normal',
        read_permission: null,
        default_required: placement.required === true,
        settings: field.settings ?? {},
        show_when_field_id: null,
        show_when_option_id: null,
        sort_order: typeof placement.sort_order === 'number' ? placement.sort_order : 0,
        is_archived: false,
        created_at: survey.askedAt,
        options: options.map((option, index) => ({
          id: option.id,
          key: option.key ?? null,
          label: option.label,
          sort_order: typeof option.sort_order === 'number' ? option.sort_order : index,
          is_archived: false,
        })),
      },
    ];
  });
  const listOf = (key: string): unknown[] =>
    Array.isArray(base[key]) ? (base[key] as unknown[]) : [];
  return parseIntakeCatalog({
    ...base,
    fields: [...listOf('fields'), ...fields],
    custom_forms: [...listOf('custom_forms'), form],
    custom_form_placements: [
      ...listOf('custom_form_placements'),
      ...placements.map((placement) => ({
        ...placement,
        surface: 'custom_form',
        custom_form_id: survey.formId,
      })),
    ],
  });
}

/** What her phone needs to walk her surveys: the catalog as sent, and each survey waiting for her. */
export async function fetchMySurveySource(
  client: Client,
): Promise<{ readonly raw: unknown; readonly surveys: readonly MySurvey[] }> {
  const [catalog, surveys] = await Promise.all([
    client.rpc('intake_catalog'),
    fetchMySurveys(client),
  ]);
  if (catalog.error) throw failed(catalog.error);
  return { raw: catalog.data, surveys };
}
