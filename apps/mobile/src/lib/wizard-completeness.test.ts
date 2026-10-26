/**
 * A reorder during an unfinished wizard never skips a required screen
 * (RAPP-612): the first screen whose answers fail its own check is where she
 * resumes and where the summary sends her.
 */
import { describe, expect, test } from 'bun:test';
import type { WizardFlow } from '@ramassa/shared/intake';
import type { IntakeScreen } from '@ramassa/shared/intake-builder';
import type { OnboardingDraft } from '@ramassa/shared/onboarding-drafts';
import {
  firstIncompleteScreen,
  firstIncompleteStep,
  isScreenComplete,
  resumeStep,
} from './wizard-completeness';

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
    expect(resumeStep(atLogistics, { custom: [], flow: moved })).toBe('equipment');
  });

  test('in the app order she resumes where she stopped', () => {
    expect(resumeStep(atLogistics, { custom: [], flow: appOrder })).toBe('logistics');
  });

  test('a draft resting on the summary goes back to the missing screen', () => {
    const atSummary: OnboardingDraft = { ...atLogistics, currentStep: 'summary' };
    expect(resumeStep(atSummary, { custom: [], flow: appOrder })).toBe('logistics');
  });

  test('a detail screen counts as its question screen', () => {
    const atDetails: OnboardingDraft = { ...atLogistics, currentStep: 'documentation-details' };
    expect(resumeStep(atDetails, { custom: [], flow: appOrder })).toBe('documentation-details');
  });

  test('a complete draft resumes where it was', () => {
    expect(resumeStep(complete, { custom: [], flow: moved })).toBe('summary');
  });
});

describe('the required list staff chose (RAPP-611)', () => {
  const sizesOptional = new Set(['first_name', 'last_name', 'place_of_birth'] as const);

  test('optional sizes left out never block her', () => {
    const withoutSizes: OnboardingDraft = {
      ...complete,
      logistics: { ...complete.logistics, clothingSize: '', shoeSize: '' },
    };
    expect(
      firstIncompleteStep(withoutSizes, { custom: [], flow: appOrder, required: sizesOptional }),
    ).toBeNull();
  });

  test('a season question made required blocks until answered', () => {
    const childcareRequired = new Set([...sizesOptional, 'childcare_need'] as const);
    expect(
      firstIncompleteStep(complete, { custom: [], flow: appOrder, required: childcareRequired }),
    ).toBe('participation-support');
    expect(
      firstIncompleteStep(
        { ...complete, season: { childcareNeed: 'no' } },
        { custom: [], flow: appOrder, required: childcareRequired },
      ),
    ).toBeNull();
  });

  test('a required staff question with no answer is where she goes', () => {
    const screen: IntakeScreen = {
      id: 'transport',
      title: { ca: 'Transport' },
      intro: null,
      afterScreen: 'logistics',
      isArchived: false,
      questions: [
        {
          id: 'q1',
          type: 'short_text',
          label: { ca: 'Com arribes?' },
          help: null,
          privacy: 'normal',
          isArchived: false,
          isRequired: true,
          settings: {},
          options: [],
        },
      ],
    };
    const context = {
      custom: [{ id: 'transport', afterScreen: 'logistics' as const, isAnswered: false }],
      flow: appOrder,
      customScreens: [screen],
    };
    expect(firstIncompleteStep(complete, context)).toBe('custom:transport');
    expect(firstIncompleteStep({ ...complete, custom: { q1: 'Bus' } }, context)).toBeNull();
    expect(firstIncompleteStep(complete, { ...context, storedCustom: { q1: 'Tren' } })).toBeNull();
  });
});

describe('signature blocks (RAPP-690)', () => {
  const block = (id: string, screenKey: string) => ({
    id,
    surface: 'onboarding' as const,
    screenKey,
    kind: 'signature' as const,
    body: { ca: 'Autoritzo el transport' },
    sortOrder: 0,
  });
  const strokes: [number, number][][] = [
    [
      [10, 20],
      [30, 40],
    ],
  ];

  test('an app screen with a block she has not signed is where she goes', () => {
    const context = { custom: [], flow: appOrder, blocks: [block('b1', 'logistics')] };
    expect(firstIncompleteStep(complete, context)).toBe('logistics');
    expect(firstIncompleteStep({ ...complete, signatures: { b1: null } }, context)).toBe(
      'logistics',
    );
    expect(firstIncompleteStep({ ...complete, signatures: { b1: strokes } }, context)).toBeNull();
  });

  test('so is a Ramassà screen with only a block', () => {
    const screen: IntakeScreen = {
      id: 'normes',
      title: { ca: 'Normes' },
      intro: null,
      afterScreen: 'logistics',
      isArchived: false,
      questions: [],
    };
    const context = {
      custom: [{ id: 'normes', afterScreen: 'logistics' as const, isAnswered: false }],
      flow: appOrder,
      customScreens: [screen],
      blocks: [block('b2', 'normes')],
    };
    expect(firstIncompleteStep(complete, context)).toBe('custom:normes');
    expect(firstIncompleteStep({ ...complete, signatures: { b2: strokes } }, context)).toBeNull();
  });
});
