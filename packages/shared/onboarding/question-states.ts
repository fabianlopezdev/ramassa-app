/**
 * Which wizard questions a woman is asked (RAPP-301).
 *
 * Staff set one of three states per question, for one woman, before she joins:
 *   - Auto (the default, stored as no row): the RAPP-300 rule, asked only when
 *     nobody answered it;
 *   - Ask: always asked, opening with the staff answer for her to confirm;
 *   - Don't ask (`skip`): never asked. The summary still shows the value.
 * A required question needs an answer before it can be hidden, so a finished
 * profile is always complete. The database enforces the same rule.
 *
 * Her app reads only the resulting list (`my_questions_to_ask`), never the
 * staff settings themselves.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { withCancellation, type CancellableRequest } from '../lib/cancellation';
import type { Database } from '../types/database';
import {
  answeredQuestionsSchema,
  INTAKE_QUESTIONS,
  QUESTION_SCREENS,
  SCREEN_QUESTIONS,
  type AnsweredQuestions,
  type IntakeQuestion,
} from './intake';

type Client = SupabaseClient<Database>;

export const INTAKE_QUESTION_STATES = ['auto', 'ask', 'skip'] as const;
export type IntakeQuestionState = (typeof INTAKE_QUESTION_STATES)[number];

/** Only the states that differ from Auto are stored. */
export type QuestionStates = Readonly<Partial<Record<IntakeQuestion, 'ask' | 'skip'>>>;

/**
 * The built-in questions a finished profile must answer when staff changed
 * nothing: what the onboarding schemas require by default (a test checks it
 * against them). The document is optional since RAPP-302. Staff change the
 * list per organization (RAPP-611); the database holds the one list
 * (`private.required_intake_questions`) and this default mirrors its block
 * marked `required-intake-questions`.
 */
export const DEFAULT_REQUIRED_INTAKE_QUESTIONS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'place_of_birth',
  'nationality',
  'preferred_language',
  'reference_entity',
  'dependents',
  'clothing_size',
  'shoe_size',
] as const satisfies readonly IntakeQuestion[];

/**
 * Always required, whatever staff choose (spec guard): her name, so staff and
 * the app can address her, and her app language, so every screen can speak to
 * her. Mirrors the block marked `locked-required-intake-questions`.
 */
export const LOCKED_REQUIRED_INTAKE_QUESTIONS = [
  'first_name',
  'last_name',
  'preferred_language',
] as const satisfies readonly IntakeQuestion[];

/** The built-in questions that need an answer, for one organization. */
export type RequiredQuestions = ReadonlySet<IntakeQuestion>;

export const DEFAULT_REQUIRED_QUESTIONS: RequiredQuestions = new Set(
  DEFAULT_REQUIRED_INTAKE_QUESTIONS,
);

export function isLockedRequiredQuestion(question: IntakeQuestion): boolean {
  return (LOCKED_REQUIRED_INTAKE_QUESTIONS as readonly IntakeQuestion[]).includes(question);
}

/** The required list as the catalog sends it: the locked three always in, unknown names out. */
export function requiredQuestionsFrom(questions: readonly string[]): RequiredQuestions {
  return new Set([
    ...LOCKED_REQUIRED_INTAKE_QUESTIONS,
    ...questions.filter((question): question is IntakeQuestion =>
      (INTAKE_QUESTIONS as readonly string[]).includes(question),
    ),
  ]);
}

/** Every question a wizard screen asks, in screen order. */
export const WIZARD_QUESTIONS: readonly IntakeQuestion[] = QUESTION_SCREENS.flatMap(
  (screen) => SCREEN_QUESTIONS[screen],
);

export const INTAKE_STATE_PRESET_KEYS = ['missing', 'review'] as const;
export type IntakeStatePreset = (typeof INTAKE_STATE_PRESET_KEYS)[number];

/** "Only what is missing" (all Auto) and "She reviews everything" (all Ask). */
export const INTAKE_STATE_PRESETS: Readonly<Record<IntakeStatePreset, QuestionStates>> = {
  missing: {},
  review: Object.fromEntries(WIZARD_QUESTIONS.map((question) => [question, 'ask' as const])),
};

export function isRequiredQuestion(
  question: IntakeQuestion,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): boolean {
  return isLockedRequiredQuestion(question) || required.has(question);
}

/** Don't ask is allowed on an optional question, or on a required one that has an answer. */
export function canSkipQuestion(
  question: IntakeQuestion,
  answered: AnsweredQuestions,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): boolean {
  return !isRequiredQuestion(question, required) || answered.has(question);
}

/** The wizard questions she is asked. Mirrors `public.my_questions_to_ask()`. */
export function questionsToAsk(
  answered: AnsweredQuestions,
  states: QuestionStates,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): ReadonlySet<IntakeQuestion> {
  return new Set(
    WIZARD_QUESTIONS.filter((question) => {
      const state = states[question];
      if (state === 'ask') return true;
      // A hidden required question whose answer was cleared since is asked
      // after all: a finished profile is always complete.
      if (state === 'skip') return !canSkipQuestion(question, answered, required);
      return !answered.has(question);
    }),
  );
}

/** The questions she is not asked, in the shape the wizard planner takes. */
export function questionsNotAsked(toAsk: ReadonlySet<IntakeQuestion>): AnsweredQuestions {
  return new Set(INTAKE_QUESTIONS.filter((question) => !toAsk.has(question)));
}

export function questionState(
  states: QuestionStates,
  question: IntakeQuestion,
): IntakeQuestionState {
  return states[question] ?? 'auto';
}

/** The `set_intake_question_states` payload: only what changed, Auto for a removed state. */
export function questionStateChanges(
  current: QuestionStates,
  next: QuestionStates,
): Partial<Record<IntakeQuestion, IntakeQuestionState>> {
  const changes: Partial<Record<IntakeQuestion, IntakeQuestionState>> = {};
  for (const question of INTAKE_QUESTIONS) {
    const before = questionState(current, question);
    const after = questionState(next, question);
    if (before !== after) changes[question] = after;
  }
  return changes;
}

/** Her stored states as the server lists them; unknown questions are dropped. */
export const questionStatesSchema = z
  .array(z.object({ question: z.string(), state: z.enum(['ask', 'skip']) }))
  .transform((rows): QuestionStates => {
    const states: Partial<Record<IntakeQuestion, 'ask' | 'skip'>> = {};
    for (const row of rows) {
      if ((INTAKE_QUESTIONS as readonly string[]).includes(row.question)) {
        states[row.question as IntakeQuestion] = row.state;
      }
    }
    return states;
  });

/** The questions her wizard asks. She never reads the staff settings. */
export async function fetchMyQuestionsToAsk(
  client: Client,
  options: CancellableRequest = {},
): Promise<ReadonlySet<IntakeQuestion>> {
  const { data, error } = await withCancellation(client.rpc('my_questions_to_ask'), options);
  if (error) throw new AppError('DB-1', { message: error.message });
  return new Set(answeredQuestionsSchema.parse(data ?? []));
}

/** Staff read one woman's states. */
export async function fetchParticipantQuestionStates(
  client: Client,
  profileId: string,
): Promise<QuestionStates> {
  const { data, error } = await client.rpc('participant_question_states', {
    p_profile_id: profileId,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  return questionStatesSchema.parse(data ?? []);
}

/** Staff save the changed states; the database checks and audits them. */
export async function saveParticipantQuestionStates(
  client: Client,
  profileId: string,
  changes: Partial<Record<IntakeQuestion, IntakeQuestionState>>,
): Promise<void> {
  const { error } = await client.rpc('set_intake_question_states', {
    p_profile_id: profileId,
    p_states: changes,
  });
  if (error) {
    throw new AppError(databaseErrorCode(error.message), { message: error.message });
  }
}
