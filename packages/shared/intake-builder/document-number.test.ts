/**
 * Número de document keeps the check of her document type wherever staff
 * place it (RAPP-782): a NIE's form is checked on any screen, a passport's
 * and another document's number has none.
 */
import { describe, expect, test } from 'bun:test';
import { checkCustomAnswers } from './answer-messages';
import type { CustomQuestion, IntakeCatalog } from './builder';
import { documentNumberIssue, documentNumberRule } from './document-number';

const TYPE = '5eed0000-0000-4000-8099-0000000000b1';
const NUMBER = '5eed0000-0000-4000-8099-0000000000b2';
const NIE = '5eed0000-0000-4000-8099-0000000000b3';
const PASSPORT = '5eed0000-0000-4000-8099-0000000000b4';
const catalog = {
  screens: [],
  overrides: [],
  presets: [],
  systemFields: new Map([
    [
      'document_type',
      {
        id: TYPE,
        type: 'single_choice',
        privacy: 'personal',
        options: [
          { id: NIE, key: 'nie', label: { ca: 'NIE' }, isArchived: false },
          { id: PASSPORT, key: 'passport', label: { ca: 'Passaport' }, isArchived: false },
        ],
      },
    ],
    ['document_number', { id: NUMBER, type: 'short_text', privacy: 'sensitive', options: [] }],
  ]),
} as unknown as IntakeCatalog;
const question = {
  id: NUMBER,
  type: 'short_text',
  label: { ca: 'Número de document' },
  help: null,
  privacy: 'sensitive',
  isArchived: false,
  settings: {},
  isRequired: true,
  options: [],
} as unknown as CustomQuestion;
const t = (key: string) => key;

describe('documentNumberRule', () => {
  test('her type comes from her answer by field, else from her document screen', () => {
    expect(documentNumberRule(catalog, { [TYPE]: NIE })?.typeKey).toBe('nie');
    expect(documentNumberRule(catalog, {}, 'passport')?.typeKey).toBe('passport');
    expect(documentNumberRule(catalog, { [TYPE]: PASSPORT }, 'nie')?.typeKey).toBe('passport');
  });

  test('only a NIE has a form to check', () => {
    const nie = documentNumberRule(catalog, { [TYPE]: NIE });
    expect(documentNumberIssue(nie, { [NUMBER]: 'X123' })).toBe('nie');
    expect(documentNumberIssue(nie, { [NUMBER]: ' x1234567l ' })).toBeNull();
    const passport = documentNumberRule(catalog, { [TYPE]: PASSPORT });
    expect(documentNumberIssue(passport, { [NUMBER]: 'X123' })).toBeNull();
  });
});

test('the screen check says a NIE does not fit, and keeps the number in capitals', () => {
  const answers = { [TYPE]: NIE, [NUMBER]: 'x123' };
  const wrong = checkCustomAnswers([question], answers, t, {
    documentNumber: documentNumberRule(catalog, answers),
  });
  expect(wrong.errors[NUMBER]).toBe('onboarding:errorNieFormat');
  const right = { [TYPE]: NIE, [NUMBER]: ' x1234567l ' };
  const checked = checkCustomAnswers([question], right, t, {
    documentNumber: documentNumberRule(catalog, right),
  });
  expect(checked.errors).toEqual({});
  expect(checked.answers[NUMBER]).toBe('X1234567L');
});
