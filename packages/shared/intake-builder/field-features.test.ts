import { describe, expect, test } from 'bun:test';
import { featuresOfField, FIELD_FEATURES, fieldOfFeature } from './field-features';
import type { CustomQuestionType } from './question-types';

const fields = new Map<string, { id: string; type: CustomQuestionType }>([
  ['date_of_birth', { id: 'dob', type: 'date' }],
  ['nationality', { id: 'nat', type: 'short_text' }],
  ['has_dependents', { id: 'dep', type: 'single_choice' }],
]);

describe('fieldOfFeature', () => {
  test('finds the field a feature reads when its type fits', () => {
    expect(fieldOfFeature('impact.age_bands', fields)?.id).toBe('dob');
    expect(fieldOfFeature('participants.has_dependents', fields)?.id).toBe('dep');
  });

  test('reads nothing when the field changed to a type the feature does not read', () => {
    expect(fieldOfFeature('impact.nationalities', fields)).toBeUndefined();
  });

  test('reads nothing when the organization has no such field', () => {
    expect(fieldOfFeature('participants.city', fields)).toBeUndefined();
  });
});

describe('featuresOfField', () => {
  test('names every feature that reads a field and whether a type fits', () => {
    expect(featuresOfField('date_of_birth', 'short_text')).toEqual([
      { feature: 'impact.age_bands', fits: false },
      { feature: 'erasure.birth_year', fits: false },
    ]);
    expect(featuresOfField('date_of_birth', 'date').every((entry) => entry.fits)).toBe(true);
  });

  test('a staff field powers no feature', () => {
    expect(featuresOfField(null, 'date')).toEqual([]);
  });

  test('every feature reads at least one type', () => {
    for (const feature of Object.values(FIELD_FEATURES)) {
      expect(feature.types.length).toBeGreaterThan(0);
    }
  });
});
