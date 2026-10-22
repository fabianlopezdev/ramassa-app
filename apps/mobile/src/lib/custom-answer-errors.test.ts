/**
 * What her phone says when a staff question's answer does not fit (RAPP-610):
 * the shared schema decides, this names the fix in her words.
 */
import { describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import type { CustomQuestion } from '@ramassa/shared/intake-builder';
import { checkCustomAnswers, customAnswerMessage } from './custom-answer-errors';

const t = ((key: string, values?: Record<string, unknown>) =>
  values === undefined ? key : `${key} ${JSON.stringify(values)}`) as unknown as TFunction;

function question(
  type: CustomQuestion['type'],
  settings: CustomQuestion['settings'] = {},
  id = type,
): CustomQuestion {
  return {
    id,
    screenId: 'screen',
    type,
    label: { ca: 'Pregunta' },
    help: null,
    privacy: 'normal',
    placements: ['wizard'],
    isArchived: false,
    settings,
    options: [],
  };
}

describe('the message names the fix', () => {
  test('a number: not a number, whole, and the range', () => {
    const whole = question('number', { integer: true, min: 1, max: 15 });
    expect(customAnswerMessage(whole, 'tres', t)).toBe('onboarding:customErrorNumber');
    expect(customAnswerMessage(whole, 2.5, t)).toBe('onboarding:customErrorNumberWhole');
    expect(customAnswerMessage(whole, 20, t)).toBe(
      'onboarding:customErrorNumberRange {"min":1,"max":15}',
    );
    expect(customAnswerMessage(whole, 3, t)).toBeUndefined();
  });

  test('a date: a day that does not exist, or an age the question does not take', () => {
    const adult = question('date', { min_age: 18 });
    expect(customAnswerMessage(adult, '2001-02-30', t)).toBe('onboarding:errorInvalidDate');
    expect(customAnswerMessage(adult, '2020-01-01', t)).toBe('onboarding:customErrorDateAge');
    expect(customAnswerMessage(adult, '1990-01-01', t)).toBeUndefined();
  });

  test('an empty answer is never an error: every staff question is optional', () => {
    expect(customAnswerMessage(question('email'), '', t)).toBeUndefined();
    expect(
      customAnswerMessage(question('consent', { text: { ca: 'Sí' } }), false, t),
    ).toBeUndefined();
  });
});

test('a screen is tidied and checked: a phone loses its spaces, a bad email is named', () => {
  const phone = question('phone');
  const email = question('email');
  const checked = checkCustomAnswers(
    [phone, email],
    { phone: '+34 600 111 222', email: 'ana@' },
    t,
  );
  expect(checked.answers.phone).toBe('+34600111222');
  expect(checked.errors).toEqual({ email: 'onboarding:customErrorEmail' });
});

describe('a required staff question (RAPP-611)', () => {
  const required = { ...question('short_text'), isRequired: true };

  test('blocks when empty, in her wizard and re-registration', () => {
    expect(checkCustomAnswers([required], {}, t).errors).toEqual({
      short_text: 'onboarding:errorRequired',
    });
    expect(checkCustomAnswers([required], { short_text: '  ' }, t).errors).toEqual({
      short_text: 'onboarding:errorRequired',
    });
    expect(checkCustomAnswers([required], { short_text: 'Sí' }, t).errors).toEqual({});
  });

  test('never on the entity referral form', () => {
    expect(checkCustomAnswers([required], {}, t, { enforceRequired: false }).errors).toEqual({});
  });

  test('an unticked required consent is missing', () => {
    const consent = {
      ...question('consent', { text: { ca: 'Accepto' } }),
      isRequired: true,
    };
    expect(checkCustomAnswers([consent], { consent: false }, t).errors).toEqual({
      consent: 'onboarding:errorRequired',
    });
  });
});
