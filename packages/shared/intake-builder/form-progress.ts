/**
 * A half-answered form (RAPP-886): her answers so far and the screen she left
 * it on are kept on the server, so the form opens again where she left it and
 * its card says "Continua", as a started survey's does.
 *
 *   - What is kept: her answers to the form's fields that differ from her
 *     record, and the screen she was on (null on the first). Her signatures
 *     and consent ticks are given when she sends the form, so they are not.
 *   - Where she resumes: her record with her answers so far over it, at the
 *     screen she left when her answers still show it, else the first.
 *   - Nothing kept and the first screen: the form is new again.
 *
 * The server encrypts what is kept and only she reads it back
 * (`my_custom_form_progress`); sending, deleting or a withdrawn form remove it.
 *
 * Docs: https://zod.dev/api
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { Database, Json } from '../types/database';
import { type CustomAnswers, type CustomAnswerValue, type IntakeCatalog } from './builder';
import type { CustomForm } from './custom-form-model';
import { customFormScreenQuestions } from './custom-forms';
import { formWalkScreens } from './form-walk';
import { customFormAskingScreens } from './onboarding-chain';
import { customAnswerValueSchema } from './question-types';

type Client = SupabaseClient<Database>;

/** What is kept of a form she left half way. */
export interface CustomFormProgress {
  /** The screen she was on; null on the first. */
  readonly screenId: string | null;
  /** Her answers that differ from her record, by field id. */
  readonly answers: CustomAnswers;
}

export const EMPTY_CUSTOM_FORM_PROGRESS: CustomFormProgress = { screenId: null, answers: {} };

/** The fields the form asks on any of its screens. */
function askedFieldIds(catalog: IntakeCatalog, form: Pick<CustomForm, 'screens'>): Set<string> {
  return new Set(
    customFormAskingScreens(catalog, form).flatMap((screen) =>
      customFormScreenQuestions(catalog, screen.id).map((question) => question.id),
    ),
  );
}

function sameAnswer(a: CustomAnswerValue | undefined, b: CustomAnswerValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What to keep of the walk: her answers to the form's fields that differ
 * from her record, and the screen she is on (null when it is the first her
 * answers show).
 */
export function formProgressOf(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  saved: CustomAnswers,
  answers: CustomAnswers,
  screenId: string,
): CustomFormProgress {
  const asked = askedFieldIds(catalog, form);
  const kept = Object.fromEntries(
    Object.entries(answers).filter(
      ([id, value]) => asked.has(id) && value !== undefined && !sameAnswer(value, saved[id]),
    ),
  );
  const first = formWalkScreens(catalog, form, { ...saved, ...answers })[0]?.id;
  return { screenId: screenId === first ? null : screenId, answers: kept };
}

/** Whether two kept states are the same, so saving again would change nothing. */
export function isSameFormProgress(a: CustomFormProgress, b: CustomFormProgress): boolean {
  return a.screenId === b.screenId && JSON.stringify(a.answers) === JSON.stringify(b.answers);
}

/**
 * Where she resumes a form: her record with her answers so far over it (only
 * to fields the form still asks), at the screen she left while her answers
 * still show it, else at the first.
 */
export function resumedFormWalk(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  saved: CustomAnswers,
  progress: CustomFormProgress | null,
): { readonly answers: CustomAnswers; readonly screenId: string | undefined } {
  const asked = askedFieldIds(catalog, form);
  const answers = {
    ...saved,
    ...Object.fromEntries(Object.entries(progress?.answers ?? {}).filter(([id]) => asked.has(id))),
  };
  const shown = formWalkScreens(catalog, form, answers);
  const left = shown.find((screen) => screen.id === progress?.screenId);
  return { answers, screenId: (left ?? shown[0])?.id };
}

// The server ---------------------------------------------------------------------------------------------

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message), { message: error.message });
}

const progressSchema = z.object({
  screen_id: z.uuid().nullable(),
  answers: z.record(z.string(), z.unknown()),
});

/**
 * Her answers so far to one of her open forms; null when she has none. An
 * answer this build cannot read is left out, and a row it cannot read starts
 * the form again.
 */
export async function fetchMyCustomFormProgress(
  client: Client,
  responseId: string,
): Promise<CustomFormProgress | null> {
  const { data, error } = await client.rpc('my_custom_form_progress', {
    p_response_id: responseId,
  });
  if (error) throw databaseError(error);
  if (data === null) return null;
  const parsed = progressSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    screenId: parsed.data.screen_id,
    answers: Object.fromEntries(
      Object.entries(parsed.data.answers).flatMap(([id, value]) => {
        const answer = customAnswerValueSchema.safeParse(value);
        return answer.success ? [[id, answer.data]] : [];
      }),
    ),
  };
}

/** Keeps her answers so far; empty answers on the first screen make the form new again. */
export async function saveCustomFormProgress(
  client: Client,
  responseId: string,
  progress: CustomFormProgress,
): Promise<void> {
  const { error } = await client.rpc('save_custom_form_progress', {
    p_response_id: responseId,
    p_answers: progress.answers as unknown as Json,
    ...(progress.screenId === null ? {} : { p_screen_id: progress.screenId }),
  });
  if (error) throw databaseError(error);
}

/** The asks she started and left half way, by response id. */
export async function fetchMyStartedCustomFormIds(client: Client): Promise<readonly string[]> {
  const { data, error } = await client.rpc('my_started_custom_forms');
  if (error) throw databaseError(error);
  return z.array(z.uuid()).catch([]).parse(data);
}
