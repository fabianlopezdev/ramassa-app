/**
 * A built-in field's label says "(optional)" from the organization's required
 * list (pending fix 21, RAPP-611), never from a fixed string.
 */
import { expect, test } from 'bun:test';
import { questionFieldLabel } from './field-label';
import { DEFAULT_REQUIRED_QUESTIONS, requiredQuestionsFrom } from './question-states';

const optional = (label: string) => `${label} (opcional)`;

test('an optional question gets the suffix and a required one does not', () => {
  expect(questionFieldLabel('phone', 'Telèfon', DEFAULT_REQUIRED_QUESTIONS, optional)).toBe(
    'Telèfon (opcional)',
  );
  const phoneRequired = requiredQuestionsFrom([...DEFAULT_REQUIRED_QUESTIONS, 'phone']);
  expect(questionFieldLabel('phone', 'Telèfon', phoneRequired, optional)).toBe('Telèfon');
});

test('a question staff made optional gets it too, the sizes and place of birth included', () => {
  const required = requiredQuestionsFrom(['reference_entity', 'dependents']);
  for (const question of ['clothing_size', 'shoe_size', 'place_of_birth', 'nationality'] as const) {
    expect(questionFieldLabel(question, 'X', required, optional)).toBe('X (opcional)');
  }
});

test('her name and app language never say optional', () => {
  const none = requiredQuestionsFrom([]);
  for (const question of ['first_name', 'last_name', 'preferred_language'] as const) {
    expect(questionFieldLabel(question, 'Nom', none, optional)).toBe('Nom');
  }
});

test('a screen whose introduction already says it is optional keeps its labels plain', () => {
  const none = requiredQuestionsFrom([]);
  for (const question of ['document', 'applicant_status', 'childcare_need'] as const) {
    expect(questionFieldLabel(question, 'X', none, optional)).toBe('X');
  }
});
