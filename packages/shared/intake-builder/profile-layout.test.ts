/**
 * The wording of a placement (RAPP-651): an override per language, and a
 * language without one reads the field's own name in that language.
 */
import { describe, expect, test } from 'bun:test';
import {
  parseProfileLayout,
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

describe('parseProfileLayout and the app fields (RAPP-660)', () => {
  const SECTION = '5eed0000-0000-4000-8091-000000000010';
  const row = (id: string, systemKey: string | null) => ({
    id,
    section_id: SECTION,
    kind: systemKey === null ? 'custom' : 'builtin',
    system_key: systemKey,
    question_type: 'short_text',
    label: { ca: systemKey ?? 'Camp' },
    help: null,
    privacy: 'personal',
    default_required: false,
    settings: {},
    show_when_field_id: null,
    show_when_option_id: null,
    sort_order: 0,
    is_archived: false,
    created_at: '2026-10-25T10:00:00Z',
    options: [
      {
        id: `${id.slice(0, -1)}f`,
        key: 'nie',
        label: { ca: 'NIE' },
        sort_order: 0,
        is_archived: false,
      },
    ],
  });
  const placed = (id: string, fieldId: string) => ({
    id,
    field_id: fieldId,
    surface: 'onboarding',
    screen_key: 'documentation',
    sort_order: 0,
    required: false,
    label_override: null,
    help_override: null,
  });
  const layout = parseProfileLayout({
    sections: [
      { id: SECTION, key: 'identity', title: { ca: 'Identitat' }, sort_order: 0, is_builtin: true },
    ],
    fields: [
      row('5eed0000-0000-4000-8091-000000000011', 'document_type'),
      row('5eed0000-0000-4000-8091-000000000012', 'document_number'),
      row('5eed0000-0000-4000-8091-000000000013', 'nationality'),
      row('5eed0000-0000-4000-8091-000000000014', null),
    ],
    placements: [
      placed('5eed0000-0000-4000-8091-000000000021', '5eed0000-0000-4000-8091-000000000011'),
      placed('5eed0000-0000-4000-8091-000000000022', '5eed0000-0000-4000-8091-000000000012'),
    ],
  })!;

  test('a split question stands for itself through its first part', () => {
    expect(layout.fields.map((field) => field.builtinKey)).toEqual([
      'document',
      'nationality',
      null,
    ]);
  });

  test('the other parts and their placements stay out until the apps render them', () => {
    expect(layout.fields.some((field) => field.id.endsWith('12'))).toBe(false);
    expect(layout.placements.map((placement) => placement.fieldId)).toEqual([
      '5eed0000-0000-4000-8091-000000000011',
    ]);
  });
});
