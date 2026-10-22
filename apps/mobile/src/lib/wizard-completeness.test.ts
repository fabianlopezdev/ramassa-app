/**
 * A reorder during an unfinished wizard never skips a required screen
 * (RAPP-612): the first screen whose answers fail its own check is where she
 * resumes and where the summary sends her.
 */
import { describe, expect, test } from 'bun:test';
import type { WizardFlow } from '@ramassa/shared/intake';
import type { OnboardingDraft } from '@ramassa/shared/onboarding-drafts';
import { firstIncompleteScreen, isScreenComplete, resumeStep } from './wizard-completeness';

const appOrder: WizardFlow = { order: [], hiddenScreens: new Set() };
// Staff moved the sizes and the season screens before her name.
const moved: WizardFlow = {
  order: ['equipment', 'season', 'identity', 'background', 'documentation', 'logistics'],
  hiddenScreens: new Set(),
};

/** Her draft when she stopped at logistics: name, background and document done. */
const atLogistics: OnboardingDraft = {
  currentStep: 'logistics',
  identity: {
    firstName: 'Amina',
    lastName: 'Diallo',
    day: '4',
    month: '3',
    year: '1999',
    placeOfBirth: 'Bamako',
    nationality: 'Mali',
    preferredLanguage: 'ca',
  },
  documentation: { documentType: 'none' },
};

const complete: OnboardingDraft = {
  ...atLogistics,
  currentStep: 'summary',
  logistics: {
    referenceEntity: null,
    hasReferenceEntity: false,
    hasDependents: false,
    numDependents: '',
    clothingSize: 'M',
    shoeSize: '38',
  },
};

describe('isScreenComplete', () => {
  test('each screen is judged by its own Continue check', () => {
    expect(isScreenComplete('identity', atLogistics)).toBe(true);
    expect(isScreenComplete('background', atLogistics)).toBe(true);
    expect(isScreenComplete('logistics', atLogistics)).toBe(false);
    expect(isScreenComplete('equipment', atLogistics)).toBe(false);
    // The season questions are all optional.
    expect(isScreenComplete('season', atLogistics)).toBe(true);
    expect(isScreenComplete('equipment', complete)).toBe(true);
  });
});

describe('firstIncompleteScreen', () => {
  test('follows the flow staff arranged', () => {
    expect(firstIncompleteScreen(atLogistics, [], appOrder)).toBe('logistics');
    expect(firstIncompleteScreen(atLogistics, [], moved)).toBe('equipment');
  });

  test('a complete draft has none; a cleared size is caught', () => {
    expect(firstIncompleteScreen(complete, [], moved)).toBeNull();
    const withoutSizes: OnboardingDraft = {
      ...complete,
      logistics: { ...complete.logistics, clothingSize: '', shoeSize: '' },
    };
    expect(firstIncompleteScreen(withoutSizes, [], appOrder)).toBe('equipment');
  });
});

describe('resumeStep', () => {
  test('a screen moved before the step she reached, still unanswered, is where she resumes', () => {
    expect(resumeStep(atLogistics, [], moved)).toBe('equipment');
  });

  test('in the app order she resumes where she stopped', () => {
    expect(resumeStep(atLogistics, [], appOrder)).toBe('logistics');
  });

  test('a draft resting on the summary goes back to the missing screen', () => {
    const atSummary: OnboardingDraft = { ...atLogistics, currentStep: 'summary' };
    expect(resumeStep(atSummary, [], appOrder)).toBe('logistics');
  });

  test('a detail screen counts as its question screen', () => {
    const atDetails: OnboardingDraft = { ...atLogistics, currentStep: 'documentation-details' };
    expect(resumeStep(atDetails, [], appOrder)).toBe('documentation-details');
  });

  test('a complete draft resumes where it was', () => {
    expect(resumeStep(complete, [], moved)).toBe('summary');
  });
});
