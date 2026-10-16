import { describe, expect, test } from 'bun:test';
import { parseServiceCategoryRow } from '@ramassa/shared/services';
import { createTranslationReview, type TranslationReview } from '@ramassa/shared/translation';
import {
  emptyField,
  fieldKey,
  isCategoryInputValid,
  isFieldValid,
  keyFromLabel,
  moveField,
  slugFromName,
  startingCategoryForm,
  toCategoryInput,
} from './service-category-form';

const label = (text: string) => ({ ca: text, es: text, en: text, ar: text, fa: text });

function approved(text: string): TranslationReview {
  const review = createTranslationReview({
    sourceLanguage: 'ca',
    sourceText: text,
    translations: {
      es: `[es] ${text}`,
      en: `[en] ${text}`,
      ar: `[ar] ${text}`,
      fa: `[fa] ${text}`,
    },
  });
  return {
    ...review,
    suggestions: review.suggestions.map((s) => ({ ...s, status: 'approved' as const })),
  };
}

const stored = parseServiceCategoryRow({
  id: '5eed0000-0000-4000-8009-000000000007',
  name: label('Lleure i cultura'),
  slug: 'leisure-culture',
  icon: 'tickets',
  color: 'primary',
  sort_order: 70,
  created_at: '2026-10-01T08:00:00+00:00',
  updated_at: '2026-10-01T08:00:00+00:00',
  metadata_schema: {
    fields: [
      {
        key: 'age_restriction',
        type: 'number',
        label: label('Edat mínima'),
        minimum: 0,
        required: false,
        filterable: true,
      },
    ],
  },
});

describe('the service category form (RAPP-347)', () => {
  test('names and labels become a slug and a key, without accents', () => {
    expect(slugFromName('Cursos d’idiomes i més')).toBe('cursos-d-idiomes-i-mes');
    expect(keyFromLabel('Edat mínima')).toBe('edat_minima');
    expect(keyFromLabel('2 places')).toBe('field_2_places');
  });

  test('a changed stored label needs its translations again', () => {
    const field = { ...startingCategoryForm(stored).fields[0]!, label: 'Edat' };
    expect(isFieldValid(field, undefined)).toBe(false);
    expect(isFieldValid(field, approved('Edat'))).toBe(true);
  });

  test('a stored field keeps its key and its five-language label', () => {
    const form = startingCategoryForm(stored);
    expect(form.fields[0]).toMatchObject({
      key: 'age_restriction',
      isStored: true,
      minimum: '0',
      label: 'Edat mínima',
    });
    expect(fieldKey({ ...form.fields[0]!, label: 'Una altra cosa' })).toBe('age_restriction');
  });

  test('a new select field needs options and five approved languages', () => {
    const field = { ...emptyField(), label: 'Nivell', type: 'select' as const };
    expect(fieldKey(field)).toBe('nivell');
    expect(isFieldValid(field, approved('Nivell'))).toBe(false);
    const withOptions = { ...field, options: ['beginner', ' advanced ', ''] };
    expect(isFieldValid(withOptions, undefined)).toBe(false);
    expect(isFieldValid(withOptions, approved('Nivell'))).toBe(true);
  });

  test('the category stores the fields in order, with a number minimum', () => {
    const form = startingCategoryForm(stored);
    const added = { ...emptyField(), label: 'Per a famílies', type: 'boolean' as const };
    const fields = moveField([...form.fields, added], 1, -1);
    const input = toCategoryInput(
      { ...form, fields },
      {
        name: approved('Lleure i cultura'),
        // The stored field's label is unchanged, so it needs no review.
        fields: { [added.id]: approved('Per a famílies') },
      },
    );
    expect(input.metadataSchema.fields.map((field) => field.key)).toEqual([
      'per_a_families',
      'age_restriction',
    ]);
    expect(input.metadataSchema.fields[1]).toMatchObject({
      minimum: 0,
      type: 'number',
      label: label('Edat mínima'),
    });
    expect(isCategoryInputValid(input)).toBe(true);
    expect(isCategoryInputValid({ ...input, slug: 'Lleure i cultura' })).toBe(false);
  });
});
