import { describe, expect, test } from 'bun:test';
import type {
  FieldPlacement,
  ProfileField,
  ProfileLayout,
  ProfileSection,
} from '@ramassa/shared/intake-builder';
import {
  controllersFirst,
  moveConsequences,
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

  test('a condition goes on any screen: its controlling field moves with it (RAPP-782)', () => {
    expect(pick('allergy_detail', SCREEN)).toEqual({ kind: 'free' });
    expect(pick('diet', SCREEN)).toEqual({ kind: 'free' });
    expect(pick('diet', 'equipment')).toEqual({ kind: 'free' });
    expect(pick('transport', 'equipment')).toEqual({ kind: 'elsewhere', screenKey: SCREEN });
  });

  test('a field on any other screen moves, her names included (RAPP-782)', () => {
    const names: ProfileLayout = {
      ...LAYOUT,
      fields: [...LAYOUT.fields, field('nom', SIZES, { kind: 'builtin', systemKey: 'first_name' })],
      placements: [...LAYOUT.placements, onboarding('nom', 'identity')],
    };
    const nom = names.fields.find((each) => each.id === 'nom')!;
    expect(onboardingPick(names, nom, 'logistics')).toEqual({
      kind: 'elsewhere',
      screenKey: 'identity',
    });
    expect(onboardingPick(names, nom, 'identity')).toEqual({ kind: 'here' });
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

describe('moveConsequences (RAPP-782)', () => {
  const doc = field('doctype', SIZES, { kind: 'builtin', systemKey: 'document_type' });
  const number = field('docnumber', SIZES, { kind: 'builtin', systemKey: 'document_number' });
  const docName = field('docname', SIZES, {
    kind: 'builtin',
    systemKey: 'document_name',
    showWhen: { fieldId: 'doctype', optionId: 'other' },
  });
  const layout: ProfileLayout = {
    ...LAYOUT,
    fields: [...LAYOUT.fields, doc, number, docName],
    placements: [
      ...LAYOUT.placements,
      onboarding('allergies', 'logistics'),
      { ...onboarding('allergy_detail', 'logistics'), id: 'p-detail' },
      onboarding('doctype', 'documentation'),
      { ...onboarding('docnumber', 'documentation-nie'), id: 'p-n1' },
      { ...onboarding('docnumber', 'documentation-passport'), id: 'p-n2' },
      onboarding('docname', 'documentation-other'),
    ],
  };
  const context = {
    layout,
    surface: 'onboarding' as const,
    screenKey: 'identity',
    screens: [{ id: SCREEN, showWhen: { fieldId: 'allergies' } }],
    blocks: [],
    consents: [{ consentId: 'photos', screenKey: 'equipment' }],
  };

  test('a field moves with its conditions, and the screen that opens on it follows', () => {
    expect(moveConsequences(context, ['allergy_detail'], [])).toEqual([
      { kind: 'field', fieldId: 'allergy_detail', from: 'logistics' },
      { kind: 'comesAlong', fieldId: 'allergies', withId: 'allergy_detail', from: 'logistics' },
      { kind: 'dependentScreen', fieldId: 'allergies', screenId: SCREEN },
      { kind: 'emptied', screenKey: 'logistics' },
    ]);
  });

  test('a question takes its follow-ups along; their own condition stays on them', () => {
    expect(moveConsequences(context, ['doctype'], [])).toEqual([
      { kind: 'field', fieldId: 'doctype', from: 'documentation' },
      {
        kind: 'followUps',
        fieldId: 'doctype',
        screens: ['documentation-nie', 'documentation-passport', 'documentation-other'],
      },
      { kind: 'emptied', screenKey: 'documentation' },
    ]);
  });

  test('a follow-up field is then asked to everyone, and the follow-ups it leaves are skipped', () => {
    expect(moveConsequences(context, ['docnumber'], [])).toEqual([
      { kind: 'field', fieldId: 'docnumber', from: 'documentation-nie' },
      { kind: 'toEveryone', fieldId: 'docnumber', from: 'documentation-nie' },
      { kind: 'emptied', screenKey: 'documentation-nie' },
      { kind: 'emptied', screenKey: 'documentation-passport' },
    ]);
  });

  test('a field placed on a sibling follow-up adds no move; a consent moves too', () => {
    expect(
      moveConsequences({ ...context, screenKey: 'documentation-other' }, ['docnumber'], []),
    ).toEqual([]);
    expect(moveConsequences(context, [], ['photos'])).toEqual([
      { kind: 'consent', consentId: 'photos', from: 'equipment' },
    ]);
  });
});
