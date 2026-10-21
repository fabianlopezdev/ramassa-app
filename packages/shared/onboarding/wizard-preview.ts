/**
 * What her guided registration will ask, shown to staff before they create
 * her invitation (RAPP-618).
 *
 * The preview decides with the same functions her phone uses, so it cannot
 * drift from what the app does:
 *   - `questionsToAsk` mirrors `public.my_questions_to_ask()`, which her
 *     wizard reads (RAPP-301);
 *   - `wizardNotAsked` is the set the phone's onboarding layout plans with:
 *     the questions she is not asked plus the built-in questions staff removed
 *     in Settings (RAPP-307).
 * What staff typed on the invitation becomes an answer the way
 * `private.apply_profile_prefill` records it: a question counts when one of its
 * keys was sent with a value. An entity's answer counts only for a question
 * whose keys staff did not send, because what staff typed wins (RAPP-303).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';
import {
  INTAKE_QUESTIONS,
  QUESTION_PAYLOAD_KEYS,
  type AnsweredQuestions,
  type IntakeQuestion,
} from './intake';
import {
  canSkipQuestion,
  questionsNotAsked,
  questionState,
  questionsToAsk,
  WIZARD_QUESTIONS,
  type IntakeQuestionState,
  type QuestionStates,
} from './question-states';

/** The questions her wizard does not ask: not asked by the rules, or removed in Settings. */
export function wizardNotAsked(
  toAsk: ReadonlySet<IntakeQuestion>,
  hidden: ReadonlySet<IntakeQuestion>,
): AnsweredQuestions {
  return new Set([...questionsNotAsked(toAsk), ...hidden]);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * The questions an invitation records as answered: the profile keys staff
 * send (`buildCreateParticipantInvitePayload`), then the profile keys the
 * entity answered on the referral (`referral_answer_keys`), for the questions
 * staff left out.
 */
export function answeredAtInvitation(
  payload: Readonly<Record<string, unknown>>,
  entityAnswerKeys: readonly string[] = [],
): AnsweredQuestions {
  const sent = new Set(Object.keys(payload));
  const fromEntity = new Set(entityAnswerKeys.filter((key) => !sent.has(key)));
  return new Set(
    INTAKE_QUESTIONS.filter((question) => {
      const keys = QUESTION_PAYLOAD_KEYS[question];
      const staffSent = keys.filter((key) => sent.has(key));
      if (staffSent.length > 0) return staffSent.some((key) => hasValue(payload[key]));
      return keys.some((key) => fromEntity.has(key));
    }),
  );
}

export interface WizardQuestionPreview {
  readonly question: IntakeQuestion;
  readonly state: IntakeQuestionState;
  readonly isAnswered: boolean;
  /** Whether her wizard shows the question. */
  readonly isAsked: boolean;
  /** Removed from the registration in Settings: never asked, whatever its state. */
  readonly isRemoved: boolean;
  /** Don't ask is allowed: optional, or required and answered. */
  readonly canSkip: boolean;
}

/** Every wizard question in screen order, with what her wizard does with it. */
export function previewWizardQuestions(
  answered: AnsweredQuestions,
  states: QuestionStates,
  hidden: ReadonlySet<IntakeQuestion> = new Set(),
): readonly WizardQuestionPreview[] {
  const notAsked = wizardNotAsked(questionsToAsk(answered, states), hidden);
  return WIZARD_QUESTIONS.map((question) => ({
    question,
    state: questionState(states, question),
    isAnswered: answered.has(question),
    isAsked: !notAsked.has(question),
    isRemoved: hidden.has(question),
    canSkip: canSkipQuestion(question, answered),
  }));
}

/**
 * The states to save with the invitation: Don't ask on a question it is not
 * allowed for falls back to Auto, as the database would refuse it.
 */
export function allowedQuestionStates(
  states: QuestionStates,
  answered: AnsweredQuestions,
): QuestionStates {
  const allowed: Partial<Record<IntakeQuestion, 'ask' | 'skip'>> = {};
  for (const question of WIZARD_QUESTIONS) {
    const state = states[question];
    if (state === 'ask') allowed[question] = 'ask';
    if (state === 'skip' && canSkipQuestion(question, answered)) allowed[question] = 'skip';
  }
  return allowed;
}

/**
 * Which of her profile fields a pending referral answers, as keys and never
 * values (`referral_answer_keys`), for the preview of a referral acceptance.
 */
export async function fetchReferralAnswerKeys(
  client: SupabaseClient<Database>,
  referralId: string,
): Promise<readonly string[]> {
  const { data, error } = await client.rpc('referral_answer_keys', {
    p_referral_id: z.uuid().parse(referralId),
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
  return z.array(z.string()).parse(data ?? []);
}
