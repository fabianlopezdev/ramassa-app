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
  DEFAULT_WIZARD_FLOW,
  isCustomStep,
  SCREEN_QUESTIONS,
  WIZARD_SCREEN_QUESTIONS,
  wizardFlowOrder,
  type AnsweredQuestions,
  type IntakeQuestion,
  type WizardFlow,
  type WizardQuestionScreen,
} from './intake';
import {
  canSkipQuestion,
  DEFAULT_REQUIRED_QUESTIONS,
  isRequiredQuestion,
  questionsNotAsked,
  questionState,
  questionsToAsk,
  WIZARD_QUESTIONS,
  type IntakeQuestionState,
  type QuestionStates,
  type RequiredQuestions,
} from './question-states';
import { isSystemFieldKey, SYSTEM_FIELD_QUESTIONS } from './system-fields';

/** The questions her wizard does not ask: not asked by the rules, or removed in Settings. */
export function wizardNotAsked(
  toAsk: ReadonlySet<IntakeQuestion>,
  hidden: ReadonlySet<IntakeQuestion>,
): AnsweredQuestions {
  return new Set([...questionsNotAsked(toAsk), ...hidden]);
}

/**
 * The questions an invitation answers (RAPP-663, RAPP-664): her names, her
 * entity when staff name one, and what the referral it answers holds
 * (`referral_answer_keys`: system keys, field ids and `season_number`). Her
 * entity is the invitation's to name, so the referral's never counts for it.
 * The staff preview plans her wizard with it.
 */
export function answeredByInvitation(
  invite: { readonly referenceEntity?: string | null },
  entityAnswerKeys: readonly string[] = [],
): AnsweredQuestions {
  const entity = invite.referenceEntity?.trim() ?? '';
  const fromEntity = entityAnswerKeys.flatMap((key): IntakeQuestion[] => {
    if (key === 'season_number') return ['season_number'];
    return isSystemFieldKey(key) && SYSTEM_FIELD_QUESTIONS[key] !== 'reference_entity'
      ? [SYSTEM_FIELD_QUESTIONS[key]]
      : [];
  });
  return new Set<IntakeQuestion>([
    'first_name',
    'last_name',
    ...(entity === '' ? [] : (['reference_entity'] as const)),
    ...fromEntity,
  ]);
}

/**
 * What her phone does with a question: shows it, shows it only when an
 * earlier answer makes it apply, or never shows it.
 */
export type WizardQuestionAsking = 'asked' | 'when-it-applies' | 'not-asked';

export interface WizardQuestionPreview {
  readonly question: IntakeQuestion;
  readonly state: IntakeQuestionState;
  readonly isAnswered: boolean;
  /** Whether her wizard may show the question (asked, or asked when it applies). */
  readonly isAsked: boolean;
  readonly asking: WizardQuestionAsking;
  /** Removed from the registration in Settings: never asked, whatever its state. */
  readonly isRemoved: boolean;
  /** Staff made it required, or it always is (RAPP-611). */
  readonly isRequired: boolean;
  /** Don't ask is allowed: optional, or required and answered. */
  readonly canSkip: boolean;
}

/** Screens whose fields always show together: her name screen shows both names. */
const SCREENS_SHOWN_WHOLE: readonly (readonly IntakeQuestion[])[] = [SCREEN_QUESTIONS.identity];

/**
 * What her phone shows, field by field, from the questions it plans with:
 *   - her name screen shows both names whenever it shows (`identity` has no
 *     per-field rule);
 *   - her contact at the entity shows only once she has an entity: after
 *     "Yes" when the entity is asked, and whenever the entity or the contact
 *     is asked (`logistics`), unless staff removed the contact.
 */
function phoneAsking(
  question: IntakeQuestion,
  notAsked: AnsweredQuestions,
  hidden: ReadonlySet<IntakeQuestion>,
): WizardQuestionAsking {
  if (question === 'reference_contact_name') {
    if (hidden.has(question)) return 'not-asked';
    const entityAsked = !notAsked.has('reference_entity');
    return entityAsked || !notAsked.has(question) ? 'when-it-applies' : 'not-asked';
  }
  const wholeScreen = SCREENS_SHOWN_WHOLE.find((screen) => screen.includes(question));
  if (wholeScreen !== undefined) {
    return wholeScreen.some((other) => !notAsked.has(other)) ? 'asked' : 'not-asked';
  }
  return notAsked.has(question) ? 'not-asked' : 'asked';
}

/** Every wizard question in the order her screens come, as staff arranged them (RAPP-612). */
export function wizardQuestionsInFlowOrder(
  flow: WizardFlow = DEFAULT_WIZARD_FLOW,
): readonly IntakeQuestion[] {
  return wizardFlowOrder([], flow)
    .filter(
      (step): step is WizardQuestionScreen =>
        !isCustomStep(step) && step in WIZARD_SCREEN_QUESTIONS,
    )
    .flatMap((screen) => WIZARD_SCREEN_QUESTIONS[screen]);
}

/** Every wizard question in her screen order, with what her wizard does with it. */
export function previewWizardQuestions(
  answered: AnsweredQuestions,
  states: QuestionStates,
  hidden: ReadonlySet<IntakeQuestion> = new Set(),
  flow: WizardFlow = DEFAULT_WIZARD_FLOW,
  // The organization's required list (RAPP-611), as her phone reads it.
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): readonly WizardQuestionPreview[] {
  const notAsked = wizardNotAsked(questionsToAsk(answered, states, required), hidden);
  return wizardQuestionsInFlowOrder(flow).map((question) => {
    const asking = phoneAsking(question, notAsked, hidden);
    return {
      question,
      state: questionState(states, question),
      isAnswered: answered.has(question),
      isAsked: asking !== 'not-asked',
      asking,
      isRemoved: hidden.has(question),
      isRequired: isRequiredQuestion(question, required),
      canSkip: canSkipQuestion(question, answered, required),
    };
  });
}

/**
 * The states to save with the invitation: Don't ask on a question it is not
 * allowed for falls back to Auto, as the database would refuse it.
 */
export function allowedQuestionStates(
  states: QuestionStates,
  answered: AnsweredQuestions,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): QuestionStates {
  const allowed: Partial<Record<IntakeQuestion, 'ask' | 'skip'>> = {};
  for (const question of WIZARD_QUESTIONS) {
    const state = states[question];
    if (state === 'ask') allowed[question] = 'ask';
    if (state === 'skip' && canSkipQuestion(question, answered, required))
      allowed[question] = 'skip';
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
