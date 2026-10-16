/**
 * Seeding the wizard from what staff or an entity already answered (RAPP-300).
 * Only ANSWERED questions are seeded: a column default (no dependants,
 * Catalan) or a value nobody chose must stay empty, so she is asked.
 */
import { describe, expect, test } from 'bun:test';
import type { IntakeQuestion } from '@ramassa/shared/intake';
import type { ProfileRow } from '@ramassa/shared/schemas';
import { seedDraftFromProfile, storedPayloadFromProfile } from './onboarding-intake';

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
