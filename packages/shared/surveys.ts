import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { isSupportedLanguage, type SupportedLanguage } from './i18n';
import {
  notificationAudienceArguments,
  notificationAudienceSchema,
  type NotificationAudience,
  type NotificationAudienceKind,
} from './notifications';
import type { Database, Json } from './types/database';

export const surveyLocalizedTextSchema = z.object({
  ca: z.string().trim().min(1).max(1000),
  es: z.string().trim().min(1).max(1000),
  en: z.string().trim().min(1).max(1000),
  ar: z.string().trim().min(1).max(1000),
  fa: z.string().trim().min(1).max(1000),
});

export type SurveyLocalizedText = z.infer<typeof surveyLocalizedTextSchema>;
export type SurveyQuestionType = 'rating' | 'multiple_choice' | 'yes_no' | 'free_text';
export type SurveyAnswer = number | string | boolean;

export interface SurveyChoice {
  readonly id: string;
  readonly label: SurveyLocalizedText;
}

export interface SurveyQuestion {
  readonly id: string;
  readonly type: SurveyQuestionType;
  readonly prompt: SurveyLocalizedText;
  readonly options: readonly SurveyChoice[] | null;
  readonly required: boolean;
  readonly sortOrder: number;
}

export interface SurveyResponse {
  readonly id: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly language: 'ca' | 'es' | 'en' | 'ar' | 'fa';
  readonly answers: Readonly<Record<string, SurveyAnswer>>;
  readonly status: 'in_progress' | 'completed';
  readonly completedAt: string | null;
}

const choiceSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_-]+$/),
  label: surveyLocalizedTextSchema,
});
const choiceListSchema = z
  .array(choiceSchema)
  .min(2)
  .max(12)
  .refine((choices) => new Set(choices.map((choice) => choice.id)).size === choices.length, {
    message: 'choice ids must be unique',
  });

const questionBaseSchema = z.object({
  id: z.uuid(),
  prompt: surveyLocalizedTextSchema,
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export const surveyQuestionSchema = z.discriminatedUnion('type', [
  questionBaseSchema.extend({ type: z.literal('rating'), options: z.null() }),
  questionBaseSchema.extend({
    type: z.literal('multiple_choice'),
    options: choiceListSchema,
  }),
  questionBaseSchema.extend({ type: z.literal('yes_no'), options: z.null() }),
  questionBaseSchema.extend({ type: z.literal('free_text'), options: z.null() }),
]);

export const surveyDefinitionSchema = z
  .object({
    title: surveyLocalizedTextSchema.refine(
      (copy) => Object.values(copy).every((value) => value.length <= 160),
      'survey titles cannot exceed 160 characters',
    ),
    eventId: z.uuid().nullable(),
    publishedAt: z.iso.datetime(),
    closesAt: z.iso.datetime().nullable(),
    audience: notificationAudienceSchema,
    questions: z.array(surveyQuestionSchema).min(1).max(30),
  })
  .superRefine((value, context) => {
    if (value.closesAt && Date.parse(value.closesAt) <= Date.parse(value.publishedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'survey closing time must follow its publication time',
      });
    }
    const ids = new Set(value.questions.map((question) => question.id));
    if (ids.size !== value.questions.length) {
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'question ids must be unique',
      });
    }
  });

export interface SurveyDefinition {
  readonly title: SurveyLocalizedText;
  readonly eventId: string | null;
  readonly publishedAt: string;
  readonly closesAt: string | null;
  readonly audience: NotificationAudience;
  readonly questions: readonly SurveyQuestion[];
}

function answerIsValid(question: SurveyQuestion, answer: unknown): boolean {
  switch (question.type) {
    case 'rating':
      return typeof answer === 'number' && Number.isInteger(answer) && answer >= 1 && answer <= 5;
    case 'multiple_choice':
      return (
        typeof answer === 'string' &&
        question.options?.some((option) => option.id === answer) === true
      );
    case 'yes_no':
      return typeof answer === 'boolean';
    case 'free_text':
      return typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 4000;
  }
}

export function surveyResponseDraftSchema(questions: readonly SurveyQuestion[]) {
  return z
    .object({
      answers: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
      complete: z.boolean(),
    })
    .superRefine((draft, context) => {
      const knownQuestions = new Map(questions.map((question) => [question.id, question]));
      for (const [questionId, answer] of Object.entries(draft.answers)) {
        const question = knownQuestions.get(questionId);
        if (!question || !answerIsValid(question, answer)) {
          context.addIssue({
            code: 'custom',
            path: ['answers', questionId],
            message: 'answer does not match the survey question',
          });
        }
      }
      if (draft.complete) {
        for (const question of questions) {
          if (question.required && !answerIsValid(question, draft.answers[question.id])) {
            context.addIssue({
              code: 'custom',
              path: ['answers', question.id],
              message: 'required question must be answered',
            });
          }
        }
      }
    });
}

export function findSurveyResumeIndex(
  questions: readonly SurveyQuestion[],
  answers: Readonly<Record<string, SurveyAnswer>>,
): number {
  const requiredUnanswered = questions.findIndex(
    (question) => question.required && !answerIsValid(question, answers[question.id]),
  );
  if (requiredUnanswered >= 0) return requiredUnanswered;
  const unanswered = questions.findIndex((question) => answers[question.id] === undefined);
  return unanswered >= 0 ? unanswered : questions.length;
}

export function isSurveyOpen(
  publishedAt: string,
  closesAt: string | null,
  now = new Date(),
): boolean {
  const instant = now.getTime();
  return (
    Date.parse(publishedAt) <= instant && (closesAt === null || instant < Date.parse(closesAt))
  );
}

type SurveyAggregate =
  | { readonly type: 'rating'; readonly average: number; readonly counts: Record<string, number> }
  | { readonly type: 'multiple_choice'; readonly counts: Record<string, number> }
  | { readonly type: 'yes_no'; readonly yes: number; readonly no: number }
  | {
      readonly type: 'free_text';
      readonly answers: readonly {
        readonly playerId: string;
        readonly playerName: string;
        readonly value: string;
      }[];
    };

export function aggregateSurveyResults(
  questions: readonly SurveyQuestion[],
  responses: readonly SurveyResponse[],
): { readonly responseCount: number; readonly byQuestion: Record<string, SurveyAggregate> } {
  const completed = responses.filter((response) => response.status === 'completed');
  const byQuestion: Record<string, SurveyAggregate> = {};
  for (const question of questions) {
    switch (question.type) {
      case 'rating': {
        const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        let sum = 0;
        let count = 0;
        for (const response of completed) {
          const answer = response.answers[question.id];
          if (typeof answer === 'number' && answerIsValid(question, answer)) {
            const key = String(answer);
            counts[key] = (counts[key] ?? 0) + 1;
            sum += answer;
            count += 1;
          }
        }
        byQuestion[question.id] = {
          type: 'rating',
          average: count === 0 ? 0 : sum / count,
          counts,
        };
        break;
      }
      case 'multiple_choice': {
        const counts: Record<string, number> = {};
        for (const response of completed) {
          const answer = response.answers[question.id];
          if (typeof answer === 'string' && answerIsValid(question, answer)) {
            counts[answer] = (counts[answer] ?? 0) + 1;
          }
        }
        byQuestion[question.id] = { type: 'multiple_choice', counts };
        break;
      }
      case 'yes_no': {
        let yes = 0;
        let no = 0;
        for (const response of completed) {
          const answer = response.answers[question.id];
          if (answer === true) yes += 1;
          if (answer === false) no += 1;
        }
        byQuestion[question.id] = { type: 'yes_no', yes, no };
        break;
      }
      case 'free_text':
        byQuestion[question.id] = {
          type: 'free_text',
          answers: completed.flatMap((response) => {
            const answer = response.answers[question.id];
            return typeof answer === 'string' && answer.trim().length > 0
              ? [{ playerId: response.playerId, playerName: response.playerName, value: answer }]
              : [];
          }),
        };
        break;
    }
  }
  return { responseCount: completed.length, byQuestion };
}

function spreadsheetSafe(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const text = spreadsheetSafe(value === null || value === undefined ? '' : String(value));
  return `"${text.replaceAll('"', '""')}"`;
}

function surveyCsvRows(
  questions: readonly SurveyQuestion[],
  responses: readonly SurveyResponse[],
): readonly (readonly unknown[])[] {
  const orderedQuestions = [...questions].sort((left, right) => left.sortOrder - right.sortOrder);
  return [
    [
      'response_id',
      'player_id',
      'player_name',
      'language',
      'status',
      'completed_at',
      ...orderedQuestions.map((question) => question.prompt.en),
    ],
    ...responses.map((response) => [
      response.id,
      response.playerId,
      response.playerName,
      response.language,
      response.status,
      response.completedAt ?? '',
      ...orderedQuestions.map((question) => response.answers[question.id] ?? ''),
    ]),
  ];
}

export function buildSurveyCsv(
  questions: readonly SurveyQuestion[],
  responses: readonly SurveyResponse[],
): string {
  const rows = surveyCsvRows(questions, responses);
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function streamSurveyCsv(
  questions: readonly SurveyQuestion[],
  responses: readonly SurveyResponse[],
): ReadableStream<Uint8Array> {
  const rows = surveyCsvRows(questions, responses);
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('\uFEFF'));
      for (const row of rows) {
        controller.enqueue(encoder.encode(`${row.map(csvCell).join(',')}\r\n`));
      }
      controller.close();
    },
  });
}

type Client = SupabaseClient<Database>;
type RpcClient = Pick<Client, 'rpc'>;

export interface StaffSurvey extends SurveyDefinition {
  readonly id: string;
  readonly responseCount: number;
  readonly completedCount: number;
}

export interface PlayerSurvey {
  readonly id: string;
  readonly title: SurveyLocalizedText;
  readonly eventId: string | null;
  readonly publishedAt: string;
  readonly closesAt: string | null;
  readonly questions: readonly SurveyQuestion[];
  readonly responseStatus: 'in_progress' | 'completed' | null;
  readonly completedAt: string | null;
}

export interface OwnSurveyResponse {
  readonly id: string;
  readonly answers: Readonly<Record<string, SurveyAnswer>>;
  readonly status: 'in_progress' | 'completed';
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

const answersSchema = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));
const audienceKindSchema = z.enum(['all', 'interest', 'signup', 'entity', 'custom_group']);
const staffSurveyRowSchema = z.object({
  id: z.uuid(),
  title: surveyLocalizedTextSchema,
  event_id: z.uuid().nullable(),
  published_at: z.string(),
  closes_at: z.string().nullable(),
  audience_kind: audienceKindSchema,
  audience_config: z.record(z.string(), z.unknown()),
  questions: z.array(surveyQuestionSchema),
  response_count: z.coerce.number().int().nonnegative(),
  completed_count: z.coerce.number().int().nonnegative(),
});
const playerSurveyRowSchema = z.object({
  id: z.uuid(),
  title: surveyLocalizedTextSchema,
  event_id: z.uuid().nullable(),
  published_at: z.string(),
  closes_at: z.string().nullable(),
  questions: z.array(surveyQuestionSchema),
  response_status: z.enum(['in_progress', 'completed']).nullable(),
  completed_at: z.string().nullable(),
});
const ownResponseRowSchema = z.object({
  id: z.uuid(),
  answers: answersSchema,
  status: z.enum(['in_progress', 'completed']),
  completed_at: z.string().nullable(),
  updated_at: z.string(),
});
const responseRowSchema = z.object({
  id: z.uuid(),
  player_id: z.uuid(),
  player_name: z.string(),
  language: z.string(),
  answers: answersSchema,
  status: z.enum(['in_progress', 'completed']),
  completed_at: z.string().nullable(),
});

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

function audienceFromDatabase(
  kind: NotificationAudienceKind,
  config: Readonly<Record<string, unknown>>,
): NotificationAudience {
  switch (kind) {
    case 'all':
      return { kind };
    case 'interest':
      return notificationAudienceSchema.parse({
        kind,
        serviceCategoryId: config.service_category_id,
      });
    case 'signup':
      return notificationAudienceSchema.parse({ kind, eventId: config.event_id });
    case 'entity':
      return notificationAudienceSchema.parse({ kind, entityName: config.entity_name });
    case 'custom_group':
      return notificationAudienceSchema.parse({
        kind,
        customGroupId: config.custom_group_id,
      });
  }
}

export function resolveSurveyCopy(copy: SurveyLocalizedText, language: string): string {
  return copy[isSupportedLanguage(language) ? language : 'ca'];
}

export async function fetchStaffSurveys(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly StaffSurvey[]> {
  let query = client.rpc('list_surveys');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(staffSurveyRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      eventId: row.event_id,
      publishedAt: row.published_at,
      closesAt: row.closes_at,
      audience: audienceFromDatabase(row.audience_kind, row.audience_config),
      questions: row.questions,
      responseCount: row.response_count,
      completedCount: row.completed_count,
    }));
}

export async function saveSurvey(
  client: RpcClient,
  input: SurveyDefinition & { readonly id?: string },
): Promise<string> {
  const definition = surveyDefinitionSchema.parse(input);
  const { kind, config } = notificationAudienceArguments(definition.audience);
  const { data, error } = await client.rpc('save_survey', {
    p_id: input.id ?? null,
    p_title: definition.title,
    p_event_id: definition.eventId,
    p_published_at: definition.publishedAt,
    p_closes_at: definition.closesAt,
    p_audience_kind: kind,
    p_audience_config: config as Json,
    p_questions: definition.questions as unknown as Json,
  } as never);
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function fetchPlayerSurveys(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly PlayerSurvey[]> {
  let query = client.rpc('list_player_surveys');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(playerSurveyRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      eventId: row.event_id,
      publishedAt: row.published_at,
      closesAt: row.closes_at,
      questions: row.questions,
      responseStatus: row.response_status,
      completedAt: row.completed_at,
    }));
}

export async function fetchOwnSurveyResponse(
  client: RpcClient,
  surveyId: string,
  signal?: AbortSignal,
): Promise<OwnSurveyResponse | null> {
  let query = client.rpc('get_own_survey_response', { p_survey_id: z.uuid().parse(surveyId) });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  const row = z.array(ownResponseRowSchema).parse(data ?? [])[0];
  return row
    ? {
        id: row.id,
        answers: row.answers,
        status: row.status,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
      }
    : null;
}

export async function saveSurveyResponse(
  client: RpcClient,
  input: {
    readonly surveyId: string;
    readonly questions: readonly SurveyQuestion[];
    readonly answers: Readonly<Record<string, SurveyAnswer>>;
    readonly complete: boolean;
  },
): Promise<string> {
  const draft = surveyResponseDraftSchema(input.questions).parse({
    answers: input.answers,
    complete: input.complete,
  });
  const { data, error } = await client.rpc('save_survey_response', {
    p_survey_id: z.uuid().parse(input.surveyId),
    p_answers: draft.answers as Json,
    p_complete: draft.complete,
  });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function fetchSurveyResponses(
  client: RpcClient,
  surveyId: string,
  signal?: AbortSignal,
): Promise<readonly SurveyResponse[]> {
  let query = client.rpc('list_survey_responses', { p_survey_id: z.uuid().parse(surveyId) });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(responseRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.player_name,
      language: isSupportedLanguage(row.language) ? row.language : ('ca' as SupportedLanguage),
      answers: row.answers,
      status: row.status,
      completedAt: row.completed_at,
    }));
}
