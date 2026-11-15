import { describe, expect, test } from 'bun:test';
import {
  fieldAnswersPayloadSchema,
  systemFieldIdsOfQuestions,
  systemFieldIndexFromCatalog,
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
