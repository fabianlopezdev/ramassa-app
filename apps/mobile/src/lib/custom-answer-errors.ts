/**
 * What her phone says when a staff question's answer does not fit it
 * (RAPP-610). The check is the shared schema (`customAnswerError`), the same
 * one the database runs; this only chooses the words, so she knows what to
 * change: a whole number, the range, the phone prefix, the age the date gives.
 */
import type { TFunction } from 'i18next';
import {
  customAnswerError,
  customAnswerSchema,
  isCustomQuestionVisible,
  isEmptyAnswer,
  itemListSettings,
  normalizeCustomAnswerInput,
  numberSettings,
  type CustomAnswers,
  type CustomAnswerValue,
  type CustomQuestion,
} from '@ramassa/shared/intake-builder';

export function customAnswerMessage(
  question: CustomQuestion,
  value: CustomAnswerValue | undefined,
  t: TFunction,
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
 * The answers of a screen, tidied (a phone without separators, an email in
 * lower case), and the message of each one that does not fit. A question she
 * cannot see is not checked.
 */
export function checkCustomAnswers(
  questions: readonly CustomQuestion[],
  answers: CustomAnswers,
  t: TFunction,
): { readonly answers: CustomAnswers; readonly errors: Readonly<Record<string, string>> } {
  const tidied: Record<string, CustomAnswerValue> = { ...answers };
  const errors: Record<string, string> = {};
  for (const question of questions) {
    const value = answers[question.id];
    if (value === undefined || !isCustomQuestionVisible(question, answers)) continue;
    tidied[question.id] = isEmptyAnswer(value)
      ? value
      : normalizeCustomAnswerInput(question, value);
    const message = customAnswerMessage(question, value, t);
    if (message !== undefined) errors[question.id] = message;
  }
  return { answers: tidied, errors };
}
