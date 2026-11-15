/**
 * Her names wherever staff placed them (RAPP-782): a name moved off her name
 * screen is read from her answer on the screen it sits on.
 */
import { describe, expect, test } from 'bun:test';
import type { IntakeCatalog, ProfileField } from '@ramassa/shared/intake-builder';
import { withPlacedNames } from './placed-names';

function nameField(id: string, systemKey: 'first_name' | 'last_name'): ProfileField {
  return {
    id,
    sectionId: 's',
    kind: 'builtin',
    builtinKey: systemKey,
    systemKey,
    type: 'short_text',
    label: { ca: systemKey },
    help: null,
    privacy: 'normal',
    defaultRequired: true,
    settings: {},
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-11-06T10:00:00Z',
    createdBy: null,
    createdByName: null,
    hasAnswers: false,
    options: [],
  };
}

const placement = (fieldId: string, screenKey: string) => ({
  id: `p-${fieldId}`,
  fieldId,
  surface: 'onboarding' as const,
  screenKey,
  sortOrder: 0,
  required: true,
  labelOverride: null,
  helpOverride: null,
});

const catalog = (nomScreen: string): IntakeCatalog =>
  ({
    layout: {
      sections: [],
      fields: [nameField('nom', 'first_name'), nameField('cognoms', 'last_name')],
      placements: [placement('nom', nomScreen), placement('cognoms', 'identity')],
    },
  }) as unknown as IntakeCatalog;

describe('withPlacedNames', () => {
  const draft = {
    currentStep: 'logistics' as const,
    identity: { firstName: 'Old', lastName: 'Diallo' },
  };

  test('a name moved to another screen comes from her answer there', () => {
    expect(withPlacedNames(draft, catalog('logistics'), { nom: 'Aisha' })?.identity).toEqual({
      firstName: 'Aisha',
      lastName: 'Diallo',
    });
  });

  test('an unanswered moved name is empty, so the checks send her back to it', () => {
    expect(withPlacedNames(draft, catalog('logistics'), {})?.identity?.firstName).toBe('');
  });

  test('names on her name screen are read as she typed them', () => {
    expect(withPlacedNames(draft, catalog('identity'), { nom: 'Aisha' })).toBe(draft);
  });
});
