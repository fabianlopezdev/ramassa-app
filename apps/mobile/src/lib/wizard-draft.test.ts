import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import {
  createInMemoryOnboardingDraftStore,
  createMmkvOnboardingDraftStore,
  type OnboardingDraft,
} from '@ramassa/shared/onboarding-drafts';
import { encodeSupportNeeds } from '@ramassa/shared/schemas';
import {
  systemFieldFixtureId as fieldId,
  systemOptionFixtureId as optionId,
  systemFieldsCatalogFixture,
} from '@ramassa/shared/testing';
import {
  dateAnswerOfParts,
  datePartsOfAnswer,
  seededDraft,
  storedDraftOfView,
  viewOfStoredDraft,
  wizardDraftStoreOn,
} from './wizard-draft';

const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
const TEAM_FIELD = '5eed0000-0000-4000-8000-000000000001';

/** A version 1 draft: each screen's form, as her phone kept it before RAPP-663. */
const legacy: OnboardingDraft = {
  currentStep: 'logistics',
  identity: {
    firstName: 'Amina',
    lastName: 'Haddad',
    day: '7',
    month: '3',
    year: '1990',
    placeOfBirth: 'Alep',
    nationality: 'Síria',
    preferredLanguage: 'ar',
  },
  documentation: { documentType: 'nie', documentNumber: 'X1234567L' },
  logistics: {
    phone: '+34600111222',
    city: 'Vic',
    hasReferenceEntity: false,
    referenceEntity: null,
    hasDependents: true,
    numDependents: '2',
    clothingSize: 'M',
  },
  season: {
    applicantStatus: 'other',
    applicantStatusDetails: 'Waiting',
    supportingEntities: ['Creu Roja'],
    childcareNeed: 'maybe',
    specificNeeds: encodeSupportNeeds({
      categories: ['health'],
      details: {},
      explanation: 'Asthma',
    }),
  },
  custom: { [TEAM_FIELD]: 'yes' },
  terms: { mediaConsent: true },
};

function fakeMmkv() {
  const backing = new Map<string, string>();
  return {
    getString: (key: string) => backing.get(key),
    set: (key: string, value: string) => void backing.set(key, value),
    remove: (key: string) => backing.delete(key),
    backing,
  };
}

describe('an old draft on her phone', () => {
  test('converts to answers by field and resumes where she was', () => {
    const mmkv = fakeMmkv();
    createMmkvOnboardingDraftStore(mmkv).saveDraft(legacy);
    const store = wizardDraftStoreOn(createMmkvOnboardingDraftStore(mmkv), fields);

    expect(store.loadDraft()).toEqual({
      ...legacy,
      documentation: { documentType: 'nie', documentNumber: 'X1234567L' },
    });
    const stored = store.loadStoredDraft();
    expect(stored?.version).toBe(2);
    expect(stored?.currentStep).toBe('logistics');
    expect(stored?.account).toEqual({
      firstName: 'Amina',
      lastName: 'Haddad',
      preferredLanguage: 'ar',
    });
    expect(stored?.answers).toEqual({
      [fieldId('date_of_birth')]: '1990-03-07',
      [fieldId('place_of_birth')]: 'Alep',
      [fieldId('nationality')]: 'Síria',
      [fieldId('document_type')]: optionId('document_type', 'nie'),
      [fieldId('document_number')]: 'X1234567L',
      [fieldId('phone')]: '+34600111222',
      [fieldId('city')]: 'Vic',
      [fieldId('has_dependents')]: optionId('has_dependents', 'yes'),
      [fieldId('num_dependents')]: 2,
      [fieldId('clothing_size')]: optionId('clothing_size', 'M'),
      [fieldId('applicant_status')]: optionId('applicant_status', 'other'),
      [fieldId('applicant_status_details')]: 'Waiting',
      [fieldId('supporting_entities')]: ['Creu Roja'],
      [fieldId('childcare_need')]: 'maybe',
      [fieldId('specific_needs')]: [optionId('specific_needs', 'health')],
      [fieldId('specific_needs_details')]: 'Asthma',
      [TEAM_FIELD]: 'yes',
    });
    // Her "No" to the entity question has no field answer: the screen keeps it.
    expect(stored?.screen).toEqual({
      'logistics.hasReferenceEntity': false,
      'logistics.referenceEntity': null,
    });
    // Kept converted: the raw store now holds version 2.
    expect(JSON.parse([...mmkv.backing.values()][0] ?? '{}').version).toBe(2);
  });

  test('a draft nobody can read yet waits for the fields, and is not lost', () => {
    const memory = createInMemoryOnboardingDraftStore();
    memory.saveDraft(legacy);
    const store = wizardDraftStoreOn(memory, fields);
    store.setFields(null);
    expect(store.loadDraft()).toBeNull();
    expect(memory.loadDraft()).toEqual(legacy);
  });
});

describe('a screen saves only what it changed', () => {
  test('a form value she changes is written; an answer no screen touched stays as stored', () => {
    const store = wizardDraftStoreOn(createInMemoryOnboardingDraftStore(), fields);
    store.saveStoredDraft({
      version: 2,
      currentStep: 'equipment',
      answers: {
        // A size the form cannot show (staff archived it since).
        [fieldId('shoe_size')]: 'unknown-size',
        [fieldId('clothing_size')]: optionId('clothing_size', 'S'),
      },
    });
    const view = store.loadDraft();
    store.saveDraft({
      ...view!,
      currentStep: 'season',
      logistics: { ...view?.logistics, clothingSize: 'L' },
    });
    expect(store.loadStoredDraft()?.answers).toEqual({
      [fieldId('shoe_size')]: 'unknown-size',
      [fieldId('clothing_size')]: optionId('clothing_size', 'L'),
    });
  });

  test('a value a screen drops removes its answer; an emptied one stays empty', () => {
    const store = wizardDraftStoreOn(createInMemoryOnboardingDraftStore(), fields);
    store.saveDraft(legacy);
    const view = store.loadDraft()!;
    store.saveDraft({
      ...view,
      documentation: { documentType: 'none' },
      identity: { ...view.identity, placeOfBirth: '' },
    });
    const answers = store.loadStoredDraft()?.answers ?? {};
    expect(answers[fieldId('document_type')]).toBe(optionId('document_type', 'none'));
    expect(answers[fieldId('document_number')]).toBeUndefined();
    expect(answers[fieldId('place_of_birth')]).toBe('');
  });

  test('her entity named after a "No" replaces the "No"', () => {
    const store = wizardDraftStoreOn(createInMemoryOnboardingDraftStore(), fields);
    store.saveDraft(legacy);
    const view = store.loadDraft()!;
    store.saveDraft({
      ...view,
      logistics: { ...view.logistics, hasReferenceEntity: true, referenceEntity: 'Càritas' },
    });
    expect(store.loadStoredDraft()?.screen).toEqual({ 'logistics.hasReferenceEntity': true });
    expect(store.loadDraft()?.logistics?.referenceEntity).toBe('Càritas');
  });

  test('the team fields are hers as she left them', () => {
    const store = wizardDraftStoreOn(createInMemoryOnboardingDraftStore(), fields);
    store.saveDraft(legacy);
    store.saveDraft({ ...store.loadDraft()!, custom: { [TEAM_FIELD]: 'no' } });
    expect(store.loadStoredDraft()?.answers?.[TEAM_FIELD]).toBe('no');
    expect(store.loadDraft()?.custom).toEqual({ [TEAM_FIELD]: 'no' });
  });

  test('an app field asked with the generic renderer is kept as she typed it (RAPP-665)', () => {
    // Nationality made free text: the wizard's forms no longer ask it.
    const formFields = new Map([...fields].filter(([key]) => key !== 'nationality'));
    const store = wizardDraftStoreOn(createInMemoryOnboardingDraftStore(), formFields);
    store.saveDraft(legacy);
    const nationality = fieldId('nationality');
    store.saveDraft({ ...store.loadDraft()!, custom: { [nationality]: 'Síria del nord' } });
    expect(store.loadStoredDraft()?.answers?.[nationality]).toBe('Síria del nord');
    expect(store.loadDraft()?.custom).toEqual({ [nationality]: 'Síria del nord' });
  });
});

describe('her birth date in three boxes', () => {
  test('a whole date is one answer; what she is still typing reads back the same', () => {
    expect(dateAnswerOfParts('7', '3', '1990')).toBe('1990-03-07');
    expect(dateAnswerOfParts('٧', '٣', '١٩٩٠')).toBe('1990-03-07');
    expect(datePartsOfAnswer('1990-03-07')).toEqual({ day: '7', month: '3', year: '1990' });
    expect(dateAnswerOfParts('7', '', '')).toBe('--7');
    expect(datePartsOfAnswer('--7')).toEqual({ day: '7', month: '', year: '' });
    expect(dateAnswerOfParts('', '', '')).toBe('');
  });
});

test('a new draft holds what staff or her entity already answered, by field', () => {
  const draft = seededDraft(fields, {
    currentStep: 'background',
    scenarioStamp: null,
    names: { firstName: 'Amina' },
    stored: {
      [fieldId('city')]: 'Vic',
      [fieldId('has_dependents')]: optionId('has_dependents', 'no'),
      [TEAM_FIELD]: 'kept on her answers',
    },
  });
  expect(draft).toEqual({
    version: 2,
    currentStep: 'background',
    account: { firstName: 'Amina' },
    answers: {
      [fieldId('city')]: 'Vic',
      [fieldId('has_dependents')]: optionId('has_dependents', 'no'),
    },
  });
  expect(viewOfStoredDraft(fields, draft).logistics).toEqual({ city: 'Vic', hasDependents: false });
});

test('reading a stored draft and saving it unchanged keeps it as it was', () => {
  const stored = storedDraftOfView(fields, legacy, null);
  expect(storedDraftOfView(fields, viewOfStoredDraft(fields, stored), stored)).toEqual(stored);
});
