/**
 * The wording of a placement (RAPP-651): an override per language, and a
 * language without one reads the field's own name in that language.
 */
import { describe, expect, test } from 'bun:test';
import {
  placementWording,
  placementWordingIn,
  type FieldPlacement,
  type ProfileField,
} from './profile-layout';

const FIELD: ProfileField = {
  id: '5eed0000-0000-4000-8091-000000000001',
  sectionId: '5eed0000-0000-4000-8091-000000000002',
  kind: 'custom',
  builtinKey: null,
  type: 'short_text',
  label: { ca: 'Talla de guants', ar: 'مقاس القفازات' },
  help: null,
  privacy: 'normal',
  defaultRequired: false,
  settings: {},
  sortOrder: 0,
  isArchived: false,
  createdAt: '2026-10-23T10:00:00Z',
  createdBy: null,
  createdByName: null,
  hasAnswers: false,
  options: [],
};

function placement(overrides: Partial<FieldPlacement> = {}): FieldPlacement {
  return {
    id: '5eed0000-0000-4000-8091-000000000003',
    fieldId: FIELD.id,
    surface: 'onboarding',
    screenKey: 'equipment',
    sortOrder: 0,
    required: false,
    labelOverride: null,
    helpOverride: null,
    ...overrides,
  };
}

describe('placementWording', () => {
  test('no override reads the field, each language falling back as the field does', () => {
    expect(placementWordingIn(placement(), FIELD, 'ar').label).toBe('مقاس القفازات');
    expect(placementWordingIn(placement(), FIELD, 'es').label).toBe('Talla de guants');
    expect(placementWording(placement(), FIELD).help).toBeNull();
  });

  test('a Catalan override leaves Arabic on the field name', () => {
    const asked = placement({ labelOverride: { ca: 'Quina talla de guants portes?' } });
    expect(placementWordingIn(asked, FIELD, 'ca').label).toBe('Quina talla de guants portes?');
    expect(placementWordingIn(asked, FIELD, 'ar').label).toBe('مقاس القفازات');
    // Spanish has no name of its own: the field's Catalan name, never the override.
    expect(placementWordingIn(asked, FIELD, 'es').label).toBe('Talla de guants');
  });

  test('an empty override is no override', () => {
    const blank = placement({ labelOverride: { ca: '  ' }, helpOverride: {} });
    expect(placementWordingIn(blank, FIELD, 'ca').label).toBe('Talla de guants');
    expect(placementWordingIn(blank, FIELD, 'ca').help).toBe('');
  });
});
