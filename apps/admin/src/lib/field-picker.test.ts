import { describe, expect, test } from 'bun:test';
import type {
  FieldPlacement,
  ProfileField,
  ProfileLayout,
  ProfileSection,
} from '@ramassa/shared/intake-builder';
import {
  controllersFirst,
  onboardingPick,
  pickerSectionFor,
  searchFields,
  togglePick,
} from './field-picker';

const SIZES = '5eed0000-0000-4000-8092-000000000001';
const HEALTH = '5eed0000-0000-4000-8092-000000000002';
const SCREEN = '5eed0000-0000-4000-8092-000000000003';

function section(id: string, key: string): ProfileSection {
  return { id, key, title: { ca: key }, isBuiltin: true };
}

function field(id: string, sectionId: string, overrides: Partial<ProfileField> = {}): ProfileField {
  return {
    id,
    sectionId,
    kind: 'custom',
    builtinKey: null,
    type: 'short_text',
    label: { ca: id },
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
    ...overrides,
  };
}

function onboarding(fieldId: string, screenKey: string): FieldPlacement {
  return {
    id: `p-${fieldId}`,
    fieldId,
    surface: 'onboarding',
    screenKey,
    sortOrder: 0,
    required: false,
    labelOverride: null,
    helpOverride: null,
  };
}

const LAYOUT: ProfileLayout = {
  sections: [section(SIZES, 'sizes'), section(HEALTH, 'health_needs')],
  fields: [
    field('shirt', SIZES, { kind: 'builtin', builtinKey: 'clothing_size' }),
    field('gloves', SIZES, { label: { ca: 'Talla de guants', ar: 'مقاس القفازات' } }),
    field('allergies', HEALTH, { label: { ca: 'Al·lèrgies' } }),
    field('allergy_detail', HEALTH, { showWhen: { fieldId: 'allergies', optionId: 'yes' } }),
    field('diet', HEALTH, { showWhen: { fieldId: 'transport', optionId: 'yes' } }),
    field('transport', HEALTH),
    field('old', HEALTH, { isArchived: true, label: { ca: 'Al·lèrgies antigues' } }),
  ],
  placements: [
    onboarding('shirt', 'equipment'),
    onboarding('gloves', 'equipment'),
    onboarding('transport', SCREEN),
  ],
};

describe('searchFields', () => {
  test('finds live fields in any language, accents and case ignored', () => {
    expect(searchFields(LAYOUT, 'ALLERGIES').map((each) => each.id)).toEqual(['allergies']);
    expect(searchFields(LAYOUT, 'القفازات').map((each) => each.id)).toEqual(['gloves']);
    expect(searchFields(LAYOUT, '  ')).toEqual([]);
  });
});

describe('togglePick', () => {
  const always = () => true;
  test('a condition brings its controlling field, and dropping that drops the condition', () => {
    const picked = togglePick(LAYOUT, new Set(), 'allergy_detail', always);
    expect([...picked].sort()).toEqual(['allergies', 'allergy_detail']);
    expect([...togglePick(LAYOUT, picked, 'allergies', always)]).toEqual([]);
  });

  test('a controlling field that cannot be picked here is left alone', () => {
    const picked = togglePick(LAYOUT, new Set(), 'allergy_detail', (id) => id !== 'allergies');
    expect([...picked]).toEqual(['allergy_detail']);
  });
});

test('controllersFirst places a controlling field before its conditions', () => {
  expect(controllersFirst(LAYOUT, ['allergy_detail', 'allergies'])).toEqual([
    'allergies',
    'allergy_detail',
  ]);
});

describe('onboardingPick', () => {
  const pick = (id: string, screen: string) =>
    onboardingPick(
      LAYOUT,
      LAYOUT.fields.find((each) => each.id === id)!,
      screen,
    );

  test('here, on another screen, or free', () => {
    expect(pick('gloves', 'equipment')).toEqual({ kind: 'here' });
    expect(pick('gloves', SCREEN)).toEqual({ kind: 'elsewhere', screenKey: 'equipment' });
    expect(pick('allergies', SCREEN)).toEqual({ kind: 'free' });
  });

  test('an app field is picked like any field: off its screen it is free (RAPP-665)', () => {
    expect(pick('shirt', 'equipment')).toEqual({ kind: 'here' });
    expect(pick('shirt', SCREEN)).toEqual({ kind: 'elsewhere', screenKey: 'equipment' });
    const unplaced = {
      ...LAYOUT,
      placements: LAYOUT.placements.filter((each) => each.fieldId !== 'shirt'),
    };
    expect(
      onboardingPick(
        unplaced,
        unplaced.fields.find((each) => each.id === 'shirt')!,
        SCREEN,
      ),
    ).toEqual({ kind: 'free' });
  });

  test('a condition goes where its controlling field is, or with it', () => {
    expect(pick('allergy_detail', SCREEN)).toEqual({ kind: 'free' });
    expect(pick('diet', SCREEN)).toEqual({ kind: 'free' });
    expect(pick('diet', 'equipment')).toEqual({
      kind: 'withController',
      controllerId: 'transport',
    });
  });
});

describe('pickerSectionFor', () => {
  test("an app screen opens on its own fields' section", () => {
    expect(pickerSectionFor(LAYOUT, 'equipment')).toBe(SIZES);
  });
  test("a Ramassà screen opens on its first field's section, an empty one on the first", () => {
    expect(pickerSectionFor(LAYOUT, SCREEN)).toBe(HEALTH);
    expect(pickerSectionFor(LAYOUT, '5eed0000-0000-4000-8092-0000000000ff')).toBe(SIZES);
  });
});
