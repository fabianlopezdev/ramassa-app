import { describe, expect, test } from 'bun:test';
import {
  fieldsOfSection,
  type FieldPlacement,
  type ProfileField,
  type ProfileLayout,
  type ProfileSection,
} from '@ramassa/shared/intake-builder';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { canDesignProfileLayout, isPrivacyLocked, surfacesOfField } from './profile-layout';

const SIZES = '5eed0000-0000-4000-8090-000000000001';
const SUPPORT = '5eed0000-0000-4000-8090-000000000002';

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

function placement(fieldId: string, surface: FieldPlacement['surface']): FieldPlacement {
  return {
    id: `${fieldId}-${surface}`,
    fieldId,
    surface,
    screenKey: surface === 'onboarding' ? 'equipment' : null,
    sortOrder: 0,
    required: false,
    labelOverride: null,
    helpOverride: null,
  };
}

const LAYOUT: ProfileLayout = {
  sections: [section(SIZES, 'sizes'), section(SUPPORT, 'support')],
  fields: [
    field('gloves', SIZES, { privacy: 'normal' }),
    field('allergies', SUPPORT, { privacy: 'sensitive' }),
    field('notes', SUPPORT, { privacy: 'sensitive' }),
    field('old', SUPPORT, { isArchived: true, privacy: 'sensitive' }),
  ],
  placements: [
    placement('gloves', 'season'),
    placement('gloves', 'onboarding'),
    placement('allergies', 'entity_form'),
  ],
};

describe('Dades de les jugadores reads the layout (RAPP-650)', () => {
  test('each section lists its live fields: app fields first, then A to Z (RAPP-658)', () => {
    const ids = (layout: ProfileLayout, sectionId: string) =>
      fieldsOfSection(layout, sectionId).map((each) => each.id);
    expect(ids(LAYOUT, SIZES)).toEqual(['gloves']);
    const mixed: ProfileLayout = {
      ...LAYOUT,
      fields: [
        field('zinc', SUPPORT, { label: { ca: 'Zinc' } }),
        field('shoe', SUPPORT, { kind: 'builtin', builtinKey: 'shoe_size', sortOrder: 2 }),
        field('alpha', SUPPORT, { label: { ca: 'Àlies' } }),
        field('shirt', SUPPORT, { kind: 'builtin', builtinKey: 'clothing_size', sortOrder: 1 }),
      ],
    };
    expect(ids(mixed, SUPPORT)).toEqual(['shirt', 'shoe', 'alpha', 'zinc']);
  });

  test('surfaces come in one fixed order, none for a team-only field', () => {
    expect(surfacesOfField(LAYOUT, 'gloves')).toEqual(['onboarding', 'season']);
    expect(surfacesOfField(LAYOUT, 'notes')).toEqual([]);
  });

  test('privacy is open only while the catalog says there are no answers', () => {
    expect(isPrivacyLocked(null)).toBe(false);
    expect(isPrivacyLocked(field('a', SIZES, { hasAnswers: false }))).toBe(false);
    expect(isPrivacyLocked(field('a', SIZES, { hasAnswers: true }))).toBe(true);
    expect(isPrivacyLocked(field('a', SIZES, { hasAnswers: null }))).toBe(true);
  });

  test('the designers are settings.organization and the onboarding design role', () => {
    const held = (...codes: PermissionCode[]) => new Set<PermissionCode>(codes);
    expect(canDesignProfileLayout(held('settings.organization'))).toBe(true);
    expect(canDesignProfileLayout(held('onboarding.design'))).toBe(true);
    expect(canDesignProfileLayout(held('participants.view', 'settings.branding'))).toBe(false);
  });
});
