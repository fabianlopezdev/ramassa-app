import { describe, expect, test } from 'bun:test';
import type {
  FieldPlacement,
  ProfileField,
  ProfileLayout,
  ProfileSection,
} from '@ramassa/shared/intake-builder';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  canDesignProfileLayout,
  fieldIdsBySection,
  fieldMove,
  isPrivacyLocked,
  profileLayoutCounts,
  surfacesOfField,
} from './profile-layout';

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
  test('each section lists its live fields in order', () => {
    expect(fieldIdsBySection(LAYOUT)).toEqual({
      [SIZES]: ['gloves'],
      [SUPPORT]: ['allergies', 'notes'],
    });
  });

  test('the count line leaves archived fields out', () => {
    expect(profileLayoutCounts(LAYOUT)).toEqual({
      sections: 2,
      fields: 3,
      sensitive: 2,
      teamOnly: 1,
    });
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

describe('a drop is read as one move (RAPP-650)', () => {
  const before = { [SIZES]: ['gloves'], [SUPPORT]: ['allergies', 'notes'] };

  test('across sections: the target section and its full new order', () => {
    const after = { [SIZES]: [], [SUPPORT]: ['allergies', 'gloves', 'notes'] };
    expect(fieldMove(before, after, 'gloves')).toEqual({
      sectionId: SUPPORT,
      order: ['allergies', 'gloves', 'notes'],
    });
  });

  test('within a section: its new order', () => {
    const after = { [SIZES]: ['gloves'], [SUPPORT]: ['notes', 'allergies'] };
    expect(fieldMove(before, after, 'notes')).toEqual({
      sectionId: SUPPORT,
      order: ['notes', 'allergies'],
    });
  });

  test('back where it was: nothing to save', () => {
    expect(fieldMove(before, before, 'notes')).toBeNull();
  });
});
