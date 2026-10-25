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
import type { Database } from '../types/database';
import {
  anyLanguageTextSchema,
  QUESTION_PRIVACY_LEVELS,
  type BuilderText,
  type QuestionPrivacy,
} from './profile-layout';
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
  /** Who reads its answers (D9): the layout says, never the app. */
  readonly privacy: QuestionPrivacy;
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
      // A catalog without it (an older server) reads as the strictest level.
      privacy: z.enum(QUESTION_PRIVACY_LEVELS).default('sensitive'),
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
      privacy: field.privacy,
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

// Reading -----------------------------------------------------------------------------------------

/** Her answers by field id, as the readers return them since RAPP-662. */
export const fieldAnswersReadSchema = z.record(z.string(), z.json());
