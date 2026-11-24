/**
 * The app's own forms she sends when she wants (RAPP-939, RAPP-940): the
 * suggestions form and the mentoring request. Each is a form of the engine
 * with one fixed screen that holds the request's own parts, and questions
 * staff add around it. What both share lives here: reading the form for her
 * phone, laying it over the catalog the form walker draws, and reading her
 * answers back with each question as she read it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { CustomQuestion, IntakeCatalog } from './intake-builder/builder';
import type { OnDemandFormKey } from './intake-builder/custom-form-model';
import { anyLanguageTextSchema, type BuilderText } from './intake-builder/profile-layout';
import {
  CUSTOM_QUESTION_TYPES,
  parseQuestionSettings,
  type CustomQuestionType,
} from './intake-builder/question-types';
import { formContentCatalog } from './intake-builder/survey-forms';
import type { Database } from './types/database';

type RpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

/** The form as she fills it in now: its screens and its questions. */
export interface OnDemandForm {
  readonly formId: string;
  readonly name: BuilderText;
  /** Its screens and placements, each naming its question, the shape a survey version has. */
  readonly content: unknown;
}

const onDemandFormSchema = z.object({
  form_id: z.uuid(),
  name: anyLanguageTextSchema.catch({}),
  content: z.unknown(),
});

const MY_FORM_FUNCTIONS = {
  feedback: 'my_feedback_form',
  mentoring: 'my_mentoring_form',
} as const satisfies Readonly<Record<OnDemandFormKey, string>>;

/** The form of this key for the player signed in; null from a server before it. */
export async function fetchMyOnDemandForm(
  client: RpcClient,
  key: OnDemandFormKey,
): Promise<OnDemandForm | null> {
  const { data, error } = await client.rpc(MY_FORM_FUNCTIONS[key] as never);
  if (error) databaseFailure(error.message);
  const parsed = onDemandFormSchema.safeParse(data);
  if (!parsed.success) return null;
  return { formId: parsed.data.form_id, name: parsed.data.name, content: parsed.data.content };
}

/**
 * The catalog her phone walks the form with: the catalog `intake_catalog`
 * sent (`raw`, which never holds these forms or their questions), with the
 * form laid over it. Its fixed screen is the one whose `systemScreen` is the
 * form's own (`feedback_message`, `mentoring_request`).
 */
export function onDemandFormCatalog(
  raw: unknown,
  key: OnDemandFormKey,
  form: OnDemandForm,
  readAt: string = new Date().toISOString(),
): IntakeCatalog {
  return formContentCatalog(raw, {
    formId: form.formId,
    name: form.name,
    kind: 'other',
    systemKey: key,
    eventId: null,
    closesAt: null,
    version: 1,
    readAt,
    content: form.content,
  });
}

/** What her phone needs to walk the form: the catalog as sent, and the form. */
export async function fetchMyOnDemandFormSource(
  client: RpcClient,
  key: OnDemandFormKey,
): Promise<{ readonly raw: unknown; readonly form: OnDemandForm | null }> {
  const [catalog, form] = await Promise.all([
    client.rpc('intake_catalog' as never),
    fetchMyOnDemandForm(client, key),
  ]);
  if (catalog.error) databaseFailure(catalog.error.message);
  return { raw: catalog.data, form };
}

// Her answers, read back by the staff who read the request ---------------------------------------

/** One answer to a question staff added, with the question as she read it. */
export interface FormAnswer {
  readonly fieldId: string;
  /** The question's wording as she read it. */
  readonly label: BuilderText;
  readonly type: CustomQuestionType;
  readonly settings: unknown;
  readonly options: readonly { readonly id: string; readonly label: BuilderText }[];
  readonly value: unknown;
}

const formAnswerSchema = z.object({
  field_id: z.uuid(),
  question: z.object({
    label: anyLanguageTextSchema,
    help: anyLanguageTextSchema.nullable().optional(),
    question_type: z.enum(CUSTOM_QUESTION_TYPES),
    settings: z.unknown().optional(),
    options: z
      .array(z.object({ id: z.string(), label: anyLanguageTextSchema }))
      .optional()
      .catch([]),
  }),
  value: z.unknown(),
});

/**
 * Her answers as the database sends them (a list of {field_id, question,
 * value}); one this build cannot read is left out.
 */
export const formAnswersSchema = z
  .array(z.unknown())
  .catch([])
  .transform((rows) =>
    rows.flatMap((row): FormAnswer[] => {
      const parsed = formAnswerSchema.safeParse(row);
      if (!parsed.success) return [];
      const { field_id: fieldId, question, value } = parsed.data;
      return [
        {
          fieldId,
          label: question.label,
          type: question.question_type,
          settings: question.settings ?? {},
          options: question.options ?? [],
          value,
        },
      ];
    }),
  );

/** An answer's question, so the shared answer text reads its value (an option's label, a yes). */
export function formAnswerQuestion(answer: FormAnswer): CustomQuestion {
  return {
    id: answer.fieldId,
    type: answer.type,
    label: answer.label,
    help: null,
    privacy: 'normal',
    isArchived: false,
    settings: parseQuestionSettings(answer.type, answer.settings),
    options: answer.options.map((option) => ({ ...option, isArchived: false })),
  };
}
