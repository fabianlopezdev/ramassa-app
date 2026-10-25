/**
 * When the app's own screens stop asking a field with their own control
 * (RAPP-665): a type or an option the control cannot draw, a field moved off
 * its screen or archived. The question's fields are then asked with the generic
 * renderer where they are placed, on her onboarding and on the entity form.
 */
import { describe, expect, test } from 'bun:test';
import { isAskedGenerically, layoutSystemFields, questionsOffTheirControl } from './app-controls';
import { appControlFits } from './app-field-form';
import type { IntakeCatalog } from './builder';
import { entityFormItems } from './entity-form';
import { onboardingScreenQuestions } from './her-onboarding';
import type { FieldPlacement, ProfileField, ProfileLayout } from './profile-layout';

const SECTION = '5eed0000-0000-4000-8096-000000000001';
const RAMASSA_SCREEN = '5eed0000-0000-4000-8096-000000000099';

function appField(
  id: number,
  systemKey: NonNullable<ProfileField['systemKey']>,
  overrides: Partial<ProfileField> = {},
): ProfileField {
  return {
    id: `5eed0000-0000-4000-8097-${String(id).padStart(12, '0')}`,
    sectionId: SECTION,
    kind: 'builtin',
    systemKey,
    builtinKey: null,
    type: 'short_text',
    label: { ca: systemKey },
    help: null,
    privacy: 'personal',
    defaultRequired: false,
    settings: {},
    sortOrder: id,
    isArchived: false,
    createdAt: '2026-10-23T10:00:00Z',
    createdBy: null,
    createdByName: null,
    hasAnswers: true,
    options: [],
    ...overrides,
  };
}

function onboarding(field: ProfileField, screenKey: string, sortOrder = 0): FieldPlacement {
  return {
    id: `${field.id.slice(0, -4)}${String(sortOrder).padStart(4, '0')}`,
    fieldId: field.id,
    surface: 'onboarding',
    screenKey,
    sortOrder,
    required: false,
    labelOverride: null,
    helpOverride: null,
  };
}

const option = (id: number, key: string | null, isArchived = false) => ({
  id: `5eed0000-0000-4000-8098-${String(id).padStart(12, '0')}`,
  key,
  label: { ca: key ?? 'Nova' },
  isArchived,
});

const BIRTH = appField(1, 'date_of_birth', { type: 'date', builtinKey: 'date_of_birth' });
const SIZE = appField(2, 'clothing_size', {
  type: 'single_choice',
  builtinKey: 'clothing_size',
  options: [option(1, 'S'), option(2, 'M')],
});
const NAME = appField(3, 'first_name', { builtinKey: 'first_name', privacy: 'normal' });

function layoutWith(fields: readonly ProfileField[], placements?: readonly FieldPlacement[]) {
  const layout: ProfileLayout = {
    sections: [{ id: SECTION, key: 'background', title: { ca: 'Origen' }, isBuiltin: true }],
    fields: [...fields],
    placements: [
      ...(placements ?? [
        onboarding(
          fields.find((field) => field.systemKey === 'date_of_birth') ?? BIRTH,
          'background',
        ),
        onboarding(
          fields.find((field) => field.systemKey === 'clothing_size') ?? SIZE,
          'equipment',
        ),
        onboarding(NAME, 'identity'),
      ]),
    ],
  };
  return layout;
}

/** The questions of these fixtures that are off their control. */
const offOf = (layout: ProfileLayout) =>
  new Set(
    [...questionsOffTheirControl(layout)].filter((question) =>
      ['date_of_birth', 'clothing_size', 'first_name'].includes(question),
    ),
  );

describe('questionsOffTheirControl', () => {
  test('the seeded fields on their own screens stay on their controls', () => {
    expect(offOf(layoutWith([BIRTH, SIZE, NAME]))).toEqual(new Set());
  });

  test('a new type takes the question off its control', () => {
    const layout = layoutWith([{ ...BIRTH, type: 'short_text' }, SIZE, NAME]);
    expect(offOf(layout)).toEqual(new Set(['date_of_birth']));
  });

  test('an option without a key the control knows takes it off; an archived one does not', () => {
    const added = { ...SIZE, options: [...SIZE.options, option(3, null)] };
    expect(offOf(layoutWith([BIRTH, added, NAME]))).toEqual(new Set(['clothing_size']));
    const archived = { ...SIZE, options: [...SIZE.options, option(3, null, true)] };
    expect(offOf(layoutWith([BIRTH, archived, NAME]))).toEqual(new Set());
    expect(
      appControlFits(layoutSystemFields(layoutWith([BIRTH, added, NAME])), 'clothing_size'),
    ).toBe(false);
  });

  test('a field moved to a Ramassà screen, or archived, leaves its control', () => {
    const moved = layoutWith(
      [BIRTH, SIZE, NAME],
      [
        onboarding(BIRTH, RAMASSA_SCREEN),
        onboarding(SIZE, 'equipment'),
        onboarding(NAME, 'identity'),
      ],
    );
    expect(offOf(moved)).toEqual(new Set(['date_of_birth']));
    const archived = layoutWith([{ ...BIRTH, isArchived: true }, SIZE, NAME]);
    expect(questionsOffTheirControl(archived).has('date_of_birth')).toBe(true);
  });

  test('her names never leave their control', () => {
    const layout = layoutWith([BIRTH, SIZE, { ...NAME, type: 'long_text' }], []);
    expect(questionsOffTheirControl(layout).has('first_name')).toBe(false);
    expect(isAskedGenerically(NAME, questionsOffTheirControl(layout))).toBe(false);
  });

  test('a layout with no app field changes nothing', () => {
    expect(questionsOffTheirControl({ sections: [], fields: [], placements: [] })).toEqual(
      new Set(),
    );
  });
});

describe('the generic renderer asks a field off its control', () => {
  test('on her onboarding, on the screen where it is placed', () => {
    const retyped = { ...BIRTH, type: 'short_text' as const };
    const layout = layoutWith([retyped, SIZE, NAME]);
    const catalog = { layout } as unknown as IntakeCatalog;
    expect(onboardingScreenQuestions(catalog, 'background').map((question) => question.id)).toEqual(
      [retyped.id],
    );
    expect(onboardingScreenQuestions(catalog, 'equipment')).toEqual([]);
  });

  test('on the entity form, as a Ramassà field', () => {
    const retyped = { ...BIRTH, type: 'short_text' as const };
    const entity = (field: ProfileField): FieldPlacement => ({
      ...onboarding(field, 'background'),
      surface: 'entity_form',
      screenKey: null,
    });
    const kinds = (birth: ProfileField) =>
      entityFormItems(layoutWith([birth, SIZE, NAME], [entity(birth), entity(SIZE)])).map(
        (item) => item.kind,
      );
    expect(kinds(BIRTH)).toEqual(['builtin', 'custom']);
    expect(kinds(retyped)).toEqual(['custom', 'custom']);
  });
});
