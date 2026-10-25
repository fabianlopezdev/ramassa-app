import { describe, expect, test } from 'bun:test';
import { encodeSupportNeeds } from '../schemas/support-needs';
import {
  fieldAnswersFromColumns,
  fieldAnswersPayloadSchema,
  hasFieldColumns,
  systemFieldIdsOfQuestions,
  systemFieldIndexFromCatalog,
  withFieldAnswers,
} from './field-answers';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const option = (n: number, key: string, ca = key, sortOrder = n) => ({
  id: id(n),
  key,
  label: { ca },
  sort_order: sortOrder,
  is_archived: false,
});

const field = (n: number, systemKey: string | null, type: string, options: unknown[] = []) => ({
  id: id(n),
  system_key: systemKey,
  question_type: type,
  options,
});

const index = systemFieldIndexFromCatalog({
  fields: [
    field(1, 'first_name', 'short_text'),
    field(2, 'date_of_birth', 'date'),
    field(3, 'document_type', 'single_choice', [
      option(31, 'nie'),
      option(32, 'passport'),
      option(33, 'other'),
      option(34, 'none'),
    ]),
    field(4, 'document_number', 'short_text'),
    field(5, 'has_dependents', 'single_choice', [option(51, 'yes'), option(52, 'no')]),
    field(6, 'num_dependents', 'number'),
    field(7, 'specific_needs', 'multiple_choice', [
      option(71, 'accessibility', 'Accessibilitat', 0),
      option(72, 'health', 'Salut', 1),
      option(73, 'other', 'Altres', 4),
      option(74, 'none', 'Cap', 5),
    ]),
    field(8, 'specific_needs_details', 'long_text'),
    field(9, 'supporting_entities', 'item_list'),
    field(10, 'nationality', 'country'),
    // A staff field is no app field.
    field(11, null, 'short_text'),
  ],
});

describe('the shared payload', () => {
  test('names and answers by field id', () => {
    const parsed = fieldAnswersPayloadSchema.parse({
      first_name: ' Fatou ',
      answers: { [id(2)]: '1990-04-02', [id(4)]: null },
    });
    expect(parsed).toEqual({
      first_name: 'Fatou',
      answers: { [id(2)]: '1990-04-02', [id(4)]: null },
    });
  });

  test('refuses an answer keyed by anything but a field id', () => {
    expect(
      fieldAnswersPayloadSchema.safeParse({ answers: { date_of_birth: '1990-04-02' } }).success,
    ).toBe(false);
  });
});

describe('the app fields of her organization', () => {
  test('keeps only system fields, by system key', () => {
    expect([...index.keys()]).not.toContain(null);
    expect(index.get('document_type')?.options.map((o) => o.key)).toEqual([
      'nie',
      'passport',
      'other',
      'none',
    ]);
    expect(index.size).toBe(10);
  });

  test('a question names every part of a field that was composite', () => {
    expect(systemFieldIdsOfQuestions(index, ['document', 'first_name'])).toEqual([id(3), id(4)]);
  });
});

describe('TEMPORARY: from a column payload', () => {
  test('a choice is its option by key, and the rest stays as it is', () => {
    const { answers, rest } = fieldAnswersFromColumns(index, {
      first_name: 'Fatou',
      preferred_language: 'ca',
      document_type: 'nie',
      document_number: ' Y1234567X ',
      date_of_birth: '1990-04-02',
    });
    expect(answers).toEqual({ [id(3)]: id(31), [id(4)]: 'Y1234567X', [id(2)]: '1990-04-02' });
    expect(rest).toEqual({ first_name: 'Fatou', preferred_language: 'ca' });
  });

  test('an empty value removes the answer, and an unknown key travels as it is', () => {
    const { answers } = fieldAnswersFromColumns(index, {
      document_type: 'driving',
      nationality: '',
    });
    expect(answers).toEqual({ [id(3)]: 'driving', [id(10)]: null });
  });

  test('dependents is yes or no, and how many counts only on yes', () => {
    expect(
      fieldAnswersFromColumns(index, { has_dependents: true, num_dependents: 2 }).answers,
    ).toEqual({
      [id(5)]: id(51),
      [id(6)]: 2,
    });
    expect(
      fieldAnswersFromColumns(index, { has_dependents: false, num_dependents: 0 }).answers,
    ).toEqual({
      [id(5)]: id(52),
      [id(6)]: null,
    });
    expect(fieldAnswersFromColumns(index, { has_dependents: null }).answers).toEqual({
      [id(5)]: null,
    });
  });

  test('the encoded specific needs become the needs and one details text', () => {
    const encoded = encodeSupportNeeds({
      categories: ['accessibility', 'health'],
      explanation: 'Ho explica ella',
      details: { health: 'Asma', accessibility: 'Cadira' },
    });
    expect(fieldAnswersFromColumns(index, { specific_needs: encoded }).answers).toEqual({
      [id(7)]: [id(71), id(72)],
      [id(8)]: 'Ho explica ella\n\nAccessibilitat: Cadira\n\nSalut: Asma',
    });
    expect(fieldAnswersFromColumns(index, { specific_needs: 'Text antic' }).answers).toEqual({
      [id(7)]: [id(73)],
      [id(8)]: 'Text antic',
    });
    expect(fieldAnswersFromColumns(index, { specific_needs: null }).answers).toEqual({
      [id(7)]: null,
      [id(8)]: null,
    });
  });

  test('a list drops blanks and repeats', () => {
    expect(
      fieldAnswersFromColumns(index, { supporting_entities: [' CEAR ', '', 'CEAR', 'Creu Roja'] })
        .answers,
    ).toEqual({ [id(9)]: ['CEAR', 'Creu Roja'] });
    expect(fieldAnswersFromColumns(index, { supporting_entities: [] }).answers).toEqual({
      [id(9)]: null,
    });
  });

  test('a staff field answer joins the converted ones', () => {
    expect(
      withFieldAnswers(index, { first_name: 'Fatou', date_of_birth: null }, { [id(11)]: 'Sí' }),
    ).toEqual({
      first_name: 'Fatou',
      answers: { [id(2)]: null, [id(11)]: 'Sí' },
    });
  });

  test('knows when a payload needs the field ids', () => {
    expect(hasFieldColumns({ first_name: 'Fatou', email: 'f@example.com' })).toBe(false);
    expect(hasFieldColumns({ first_name: 'Fatou', reference_entity: 'CEAR' })).toBe(true);
  });
});
