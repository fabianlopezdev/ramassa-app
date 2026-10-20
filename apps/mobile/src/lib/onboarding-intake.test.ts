/**
 * Seeding the wizard from what staff or an entity already answered (RAPP-300).
 * Only ANSWERED questions are seeded: a column default (no dependants,
 * Catalan) or a value nobody chose must stay empty, so she is asked.
 */
import { describe, expect, test } from 'bun:test';
import type { IntakeQuestion } from '@ramassa/shared/intake';
import type { CustomQuestion, IntakeScreen } from '@ramassa/shared/intake-builder';
import type { ProfileRow } from '@ramassa/shared/schemas';
import {
  customAnswersToSave,
  customWizardPlan,
  mergedCustomAnswers,
  seedDraftFromProfile,
  storedPayloadFromProfile,
  withSelectedLanguage,
  wizardStepRoute,
} from './onboarding-intake';

const profile: ProfileRow = {
  id: '5eed0000-0000-4000-8000-000000000098',
  first_name: 'Mariam',
  last_name: 'Keita',
  date_of_birth: '1999-03-04',
  place_of_birth: null,
  nationality: 'Mali',
  preferred_language: 'ca',
  document_type: null,
  document_number: null,
  phone: '+34600111222',
  address: null,
  city: null,
  postal_code: null,
  reference_entity: 'Creu Roja Osona',
  reference_contact_name: null,
  has_dependents: false,
  num_dependents: 0,
  clothing_size: 'M',
  shoe_size: null,
  avatar_url: null,
  media_consent: false,
  terms_accepted_at: null,
};

const answered = (...questions: IntakeQuestion[]) => new Set<IntakeQuestion>(questions);

describe('seedDraftFromProfile', () => {
  test('answered questions arrive in the shape each screen edits', () => {
    const draft = seedDraftFromProfile(
      profile,
      answered('first_name', 'last_name', 'date_of_birth', 'nationality', 'phone', 'clothing_size'),
    );
    expect(draft.identity).toEqual({
      firstName: 'Mariam',
      lastName: 'Keita',
      day: '4',
      month: '3',
      year: '1999',
      nationality: 'Mali',
    });
    expect(draft.logistics).toEqual({ phone: '+34600111222', clothingSize: 'M' });
  });

  test('a default that nobody answered is not seeded, so she is asked', () => {
    const draft = seedDraftFromProfile(profile, answered('first_name', 'last_name'));
    expect(draft.identity).not.toHaveProperty('preferredLanguage');
    expect(draft.logistics).not.toHaveProperty('hasDependents');
    expect(draft.documentation).toEqual({});
  });

  test('an answered entity brings its contact person, and dependants keep their count as text', () => {
    const draft = seedDraftFromProfile(
      { ...profile, reference_contact_name: 'Laia', has_dependents: true, num_dependents: 2 },
      answered('reference_entity', 'reference_contact_name', 'dependents'),
    );
    expect(draft.logistics).toEqual({
      referenceEntity: 'Creu Roja Osona',
      referenceContactName: 'Laia',
      hasDependents: true,
      numDependents: '2',
    });
  });

  test('an answered document seeds its type and number', () => {
    const draft = seedDraftFromProfile(
      { ...profile, document_type: 'nie', document_number: 'X1234567L' },
      answered('document'),
    );
    expect(draft.documentation).toEqual({ documentType: 'nie', documentNumber: 'X1234567L' });
  });
});

describe('storedPayloadFromProfile', () => {
  test('uses the complete_onboarding keys, so the wizard can tell what she changed', () => {
    expect(storedPayloadFromProfile(profile)).toMatchObject({
      first_name: 'Mariam',
      date_of_birth: '1999-03-04',
      has_dependents: false,
      num_dependents: 0,
      clothing_size: 'M',
      media_consent: false,
    });
  });
});

describe('staff screens in the wizard (RAPP-307)', () => {
  const choice: CustomQuestion = {
    id: 'q-choice',
    screenId: 's-transport',
    type: 'single_choice',
    label: { ca: 'Com vens?' },
    help: null,
    privacy: 'normal',
    placements: ['wizard'],
    isArchived: false,
    options: [
      { id: 'o-bus', label: { ca: 'Bus' }, isArchived: false },
      { id: 'o-old', label: { ca: 'Tren' }, isArchived: true },
    ],
  };
  const note: CustomQuestion = {
    ...choice,
    id: 'q-note',
    type: 'long_text',
    label: { ca: 'Alguna cosa més?' },
    options: [],
  };
  const screen: IntakeScreen = {
    id: 's-transport',
    title: { ca: 'Com arribes als entrenaments' },
    intro: null,
    afterScreen: 'logistics',
    isArchived: false,
    questions: [choice, note],
  };

  test('a step key opens its route, a staff screen under /onboarding/custom', () => {
    expect(String(wizardStepRoute('logistics'))).toBe('/onboarding/logistics');
    expect(String(wizardStepRoute('custom:s-transport'))).toBe('/onboarding/custom/s-transport');
  });

  test('the plan marks a staff screen answered only when every question has an answer', () => {
    expect(customWizardPlan([screen], { 'q-choice': 'o-bus' })).toEqual([
      { id: 's-transport', afterScreen: 'logistics', isAnswered: false },
    ]);
    expect(customWizardPlan([screen], { 'q-choice': 'o-bus', 'q-note': 'Res' })).toEqual([
      { id: 's-transport', afterScreen: 'logistics', isAnswered: true },
    ]);
  });

  test('only new or changed answers are sent, so a confirmed staff answer keeps its source', () => {
    const stored = { 'q-choice': 'o-bus', 'q-note': 'Res' };
    expect(
      customAnswersToSave([screen], { 'q-choice': 'o-bus', 'q-note': ' Res ' }, stored),
    ).toEqual({});
    expect(customAnswersToSave([screen], { 'q-note': 'Vinc amb la meva filla' }, stored)).toEqual({
      'q-note': 'Vinc amb la meva filla',
    });
  });

  test('an answer she emptied is sent as null, which removes it', () => {
    expect(customAnswersToSave([screen], { 'q-note': '  ' }, { 'q-note': 'Res' })).toEqual({
      'q-note': null,
    });
    expect(customAnswersToSave([screen], { 'q-note': '' }, {})).toEqual({});
  });

  test('a kept archived option and an unknown question are not sent', () => {
    expect(customAnswersToSave([screen], { 'q-choice': 'o-old', 'q-gone': 'x' }, {})).toEqual({});
  });

  test('the answers she sees are the stored ones with her draft on top', () => {
    expect(mergedCustomAnswers({ a: 'stored', b: 'stored' }, { b: '' })).toEqual({
      a: 'stored',
      b: '',
    });
  });
});

describe('onboarding language and navigation', () => {
  test('keeps the selected app language even when background is skipped, without losing draft answers', () => {
    const draft = {
      currentStep: 'summary' as const,
      identity: { firstName: 'Laia', preferredLanguage: 'ca' },
      logistics: { phone: '123' },
    };
    expect(withSelectedLanguage(draft, 'ar')).toEqual({
      ...draft,
      identity: { firstName: 'Laia', preferredLanguage: 'ar' },
    });
    expect(draft.identity.preferredLanguage).toBe('ca');
    expect(withSelectedLanguage({ currentStep: 'identity' }, 'es').identity).toEqual({
      preferredLanguage: 'es',
    });
  });
  test('back routes explicitly suppress entrance, including staff screens', () => {
    expect(wizardStepRoute('background')).toBe('/onboarding/background');
    expect(wizardStepRoute('background', 'back')).toBe('/onboarding/background?entrance=none');
    expect(wizardStepRoute('custom:transport', 'back')).toBe(
      '/onboarding/custom/transport?entrance=none',
    );
  });
});
