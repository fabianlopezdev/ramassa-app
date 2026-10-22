/**
 * What a form says when a staff question's answer does not fit it (RAPP-610):
 * her wizard, her re-registration and the entity's referral form, on the
 * phone and on the web. The check is the shared schema (`customAnswerError`),
 * the same one the database runs; this only chooses the words, so she knows
 * what to change: a whole number, the range, the phone prefix, the age the
 * date gives. The keys live in the `onboarding` namespace, in five languages.
 */
import {
  customAnswerError,
  isCustomQuestionRequired,
  isCustomQuestionVisible,
  isEmptyAnswer,
  type CustomAnswers,
  type CustomQuestion,
} from './builder';
import {
  customAnswerSchema,
  itemListSettings,
  normalizeCustomAnswerInput,
  numberSettings,
  type CustomAnswerValue,
} from './question-types';

/** The translate function of either app, as far as these messages need it. */
export type AnswerTranslate = (key: string, values?: Record<string, unknown>) => string;

export function customAnswerMessage(
  question: CustomQuestion,
  value: CustomAnswerValue | undefined,
  t: AnswerTranslate,
): string | undefined {
  if (value === undefined || isEmptyAnswer(value)) return undefined;
  const normalized = normalizeCustomAnswerInput(question, value);
  if (customAnswerError(question, normalized) === null) return undefined;
  switch (question.type) {
    case 'number': {
      const settings = numberSettings(question.settings);
      if (typeof normalized !== 'number') return t('onboarding:customErrorNumber');
      if (settings.integer && !Number.isInteger(normalized))
        return t('onboarding:customErrorNumberWhole');
      if (settings.min !== undefined && settings.max !== undefined)
        return t('onboarding:customErrorNumberRange', { min: settings.min, max: settings.max });
      if (settings.min !== undefined)
        return t('onboarding:customErrorNumberMin', { min: settings.min });
      if (settings.max !== undefined)
        return t('onboarding:customErrorNumberMax', { max: settings.max });
      return t('onboarding:customErrorNumber');
    }
    case 'date': {
      const isRealDate = customAnswerSchema({ ...question, settings: {} }).safeParse(
        normalized,
      ).success;
      return isRealDate ? t('onboarding:customErrorDateAge') : t('onboarding:errorInvalidDate');
    }
    case 'phone':
      return t('onboarding:errorPhoneFormat');
    case 'email':
      return t('onboarding:customErrorEmail');
    case 'item_list':
      return t('onboarding:customErrorList', {
        max: itemListSettings(question.settings).max_items,
      });
    default:
      return t('onboarding:customErrorInvalid');
  }
}

/**
 * Where an answer is given: her wizard and her re-registration require the
 * questions staff made required (RAPP-611); the entity's referral form never
 * does, because an entity gives what it knows and she answers the rest.
 */
export interface CheckCustomAnswersOptions {
  readonly enforceRequired?: boolean;
}

/**
 * The answers of a screen, tidied (a phone without separators, an email in
 * lower case), and the message of each one that does not fit, or that is
 * required and missing. A question she cannot see is not checked.
 */
export function checkCustomAnswers(
  questions: readonly CustomQuestion[],
  answers: CustomAnswers,
  t: AnswerTranslate,
  { enforceRequired = true }: CheckCustomAnswersOptions = {},
): { readonly answers: CustomAnswers; readonly errors: Readonly<Record<string, string>> } {
  const tidied: Record<string, CustomAnswerValue> = { ...answers };
  const errors: Record<string, string> = {};
  for (const question of questions) {
    if (!isCustomQuestionVisible(question, answers)) continue;
    const value = answers[question.id];
    if (value === undefined || isEmptyAnswer(value)) {
      if (enforceRequired && isCustomQuestionRequired(question)) {
        errors[question.id] = t('onboarding:errorRequired');
      }
      continue;
    }
    tidied[question.id] = normalizeCustomAnswerInput(question, value);
    const message = customAnswerMessage(question, value, t);
    if (message !== undefined) errors[question.id] = message;
  }
  return { answers: tidied, errors };
}
