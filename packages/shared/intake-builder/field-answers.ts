/**
 * Answers by field (RAPP-661): the one payload every writer of her data takes.
 *
 * Her names stay on her account (D2) and travel as `first_name` and
 * `last_name`. Every other answer travels in `answers`, keyed by the field's
 * id, in the shape that field's type stores (an option's id for a choice, a
 * canonical name for a country...). Null or an empty value removes the
 * answer. Each writer adds its own account settings beside them (her app
 * language, her media consent, her season count...), and the database refuses
 * any key it does not know.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { IntakeQuestion } from '../onboarding/intake';
import {
  isSystemFieldKey,
  systemKeysOfQuestion,
  type SystemFieldKey,
} from '../onboarding/system-fields';
import { decodeSupportNeeds } from '../schemas/support-needs';
import type { Database, Json } from '../types/database';
import { anyLanguageTextSchema, type BuilderText } from './profile-layout';
import {
  CUSTOM_QUESTION_TYPES,
  customAnswerValueSchema,
  type CustomAnswerValue,
  type CustomQuestionType,
} from './question-types';

type Client = SupabaseClient<Database>;

// The payload -----------------------------------------------------------------------------------

/** Answers by field id. Null removes the answer. */
export const fieldAnswersSchema = z.record(z.uuid(), customAnswerValueSchema.nullable());
export type FieldAnswers = Readonly<Record<string, CustomAnswerValue | null>>;

/** Her names, then her answers by field: what every writer takes, beside its own settings. */
export const fieldAnswersPayloadSchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  answers: fieldAnswersSchema,
});
export type FieldAnswersPayload = z.infer<typeof fieldAnswersPayloadSchema>;

// The app's fields of one organization ----------------------------------------------------------

export interface SystemFieldOption {
  readonly id: string;
  /** The stable key (D5): the string the app stored before (`nie`, `S`, `38`...). */
  readonly key: string | null;
  readonly label: BuilderText;
  readonly isArchived: boolean;
}

export interface SystemField {
  readonly id: string;
  readonly type: CustomQuestionType;
  readonly options: readonly SystemFieldOption[];
}

/** The app's fields of her organization, by system key. */
export type SystemFieldIndex = ReadonlyMap<SystemFieldKey, SystemField>;

const catalogFieldsSchema = z.object({
  fields: z.array(
    z.object({
      id: z.uuid(),
      system_key: z.string().nullable(),
      question_type: z.enum(CUSTOM_QUESTION_TYPES),
      options: z.array(
        z.object({
          id: z.uuid(),
          key: z.string().nullable().optional(),
          label: anyLanguageTextSchema,
          sort_order: z.number().int(),
          is_archived: z.boolean(),
        }),
      ),
    }),
  ),
});

/** The app's fields from `intake_catalog`, archived ones included. */
export function systemFieldIndexFromCatalog(raw: unknown): SystemFieldIndex {
  const index = new Map<SystemFieldKey, SystemField>();
  for (const field of catalogFieldsSchema.parse(raw).fields) {
    if (field.system_key === null || !isSystemFieldKey(field.system_key)) continue;
    index.set(field.system_key, {
      id: field.id,
      type: field.question_type,
      options: [...field.options]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((option) => ({
          id: option.id,
          key: option.key ?? null,
          label: option.label,
          isArchived: option.is_archived,
        })),
    });
  }
  return index;
}

/** Reads the app's fields of the caller's organization (any signed-in caller may). */
export async function fetchSystemFieldIndex(
  client: Pick<Client, 'rpc'>,
): Promise<SystemFieldIndex> {
  const { data, error } = await client.rpc('intake_catalog');
  if (error) {
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
  }
  return systemFieldIndexFromCatalog(data);
}

/** The field ids of some app questions: every part of a question that was composite. */
export function systemFieldIdsOfQuestions(
  index: SystemFieldIndex,
  questions: readonly IntakeQuestion[],
): readonly string[] {
  return questions.flatMap((question) =>
    systemKeysOfQuestion(question).flatMap((key) => {
      const field = index.get(key);
      return field === undefined || key === 'first_name' || key === 'last_name' ? [] : [field.id];
    }),
  );
}

// TEMPORARY: from the app's old column payloads ---------------------------------------------------

/**
 * TEMPORARY, until her phone and the Control Center render every field
 * (RAPP-663, RAPP-664). Their forms still build a payload in her profile's
 * column names (`date_of_birth`, `has_dependents`, the encoded
 * `specific_needs`...). This turns one into the shared payload: every key
 * that is an app field becomes its answer, the rest (her names and the
 * writer's own settings) stays as it is. The rules are those of the RAPP-660
 * copy (`private.app_field_raw_values`, `private.app_answer_value`):
 *
 *   - a choice is the option with that key (an unknown key travels as it
 *     is, so the database refuses it);
 *   - dependents is the yes or no option, and how many counts only on yes;
 *   - the encoded specific needs are the needs (several choices) and one
 *     details text, each detail named by its category when there are several;
 *   - a list drops blanks and repeats.
 *
 * A key the payload leaves out stays out: that field keeps its answer.
 */
export function fieldAnswersFromColumns(
  index: SystemFieldIndex,
  payload: Readonly<Record<string, unknown>>,
): {
  readonly answers: Record<string, CustomAnswerValue | null>;
  readonly rest: Record<string, unknown>;
} {
  const answers: Record<string, CustomAnswerValue | null> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (!isSystemFieldKey(key) || key === 'first_name' || key === 'last_name') {
      rest[key] = value;
      continue;
    }
    for (const [systemKey, raw] of columnRawValues(key, value, payload, index)) {
      const field = index.get(systemKey);
      if (field === undefined) continue;
      answers[field.id] = answerOfField(field, raw);
    }
  }
  return { answers, rest };
}

/** The shared payload from a column payload, with other answers by field (a staff field's) added. */
export function withFieldAnswers(
  index: SystemFieldIndex,
  payload: Readonly<Record<string, unknown>>,
  moreAnswers: FieldAnswers = {},
): Json {
  const { answers, rest } = fieldAnswersFromColumns(index, payload);
  return { ...rest, answers: { ...answers, ...moreAnswers } } as Json;
}

/** Whether a column payload carries any app field, so the field ids are needed. */
export function hasFieldColumns(payload: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(payload).some(
    (key) => isSystemFieldKey(key) && key !== 'first_name' && key !== 'last_name',
  );
}

type Raw = string | number | boolean | readonly string[] | null;

function columnRawValues(
  key: SystemFieldKey,
  value: unknown,
  payload: Readonly<Record<string, unknown>>,
  index: SystemFieldIndex,
): ReadonlyArray<readonly [SystemFieldKey, Raw]> {
  switch (key) {
    case 'specific_needs': {
      const parts = supportNeedsParts(value, index);
      return [
        ['specific_needs', parts.needs],
        ['specific_needs_details', parts.details],
      ];
    }
    case 'has_dependents':
      return [[key, value === true ? 'yes' : value === false ? 'no' : null]];
    case 'num_dependents':
      // How many counts only on yes; 0 is the column's "not given".
      return [
        [
          key,
          payload.has_dependents !== false && typeof value === 'number' && value > 0 ? value : null,
        ],
      ];
    case 'supporting_entities':
      return [[key, listOf(value)]];
    default:
      return [[key, plain(value)]];
  }
}

function plain(value: unknown): Raw {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function listOf(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const items = [
    ...new Set(
      value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()),
    ),
  ].filter((item) => item !== '');
  return items.length === 0 ? null : items;
}

/** The categories she chose, and one text from her explanation and the details per category. */
function supportNeedsParts(
  value: unknown,
  index: SystemFieldIndex,
): { readonly needs: readonly string[] | null; readonly details: string | null } {
  if (typeof value !== 'string' || value.trim() === '') return { needs: null, details: null };
  const answer = decodeSupportNeeds(value);
  // Text from before the needs were structured reads as another circumstance.
  if (answer === null) return { needs: ['other'], details: value.trim() };
  const options = index.get('specific_needs')?.options ?? [];
  const parts = [
    { category: null as string | null, position: 0, body: answer.explanation?.trim() ?? '' },
    ...Object.entries(answer.details).map(([category, body]) => {
      const position = options.findIndex((option) => option.key === category);
      return {
        category: options[position]?.label.ca ?? null,
        position: position + 1,
        body: (body ?? '').trim(),
      };
    }),
  ]
    .filter((part) => part.body !== '')
    .sort((a, b) => a.position - b.position);
  const details = parts
    .map((part) =>
      parts.length > 1 && part.category !== null ? `${part.category}: ${part.body}` : part.body,
    )
    .join('\n\n');
  return { needs: [...answer.categories], details: details === '' ? null : details };
}

/** A stored string as the answer of its field: a choice by its option's key. */
function answerOfField(field: SystemField, raw: Raw): CustomAnswerValue | null {
  if (raw === null) return null;
  const optionId = (key: string) =>
    (
      field.options.find((option) => option.key === key && !option.isArchived) ??
      field.options.find((option) => option.key === key)
    )?.id;
  if (
    (field.type === 'single_choice' || field.type === 'search_choice') &&
    typeof raw === 'string'
  ) {
    return optionId(raw) ?? raw;
  }
  if (field.type === 'multiple_choice' && Array.isArray(raw)) {
    const ids = raw.map(optionId);
    return ids.every((id): id is string => id !== undefined) ? ids : [...raw];
  }
  return Array.isArray(raw) ? [...raw] : (raw as CustomAnswerValue);
}
