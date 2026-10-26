import { wizardDraftStoreOn } from '@/lib/wizard-draft';
import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { WizardFlow } from '@ramassa/shared/intake';
import { EMPTY_INTAKE_CATALOG, systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import { createInMemoryOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';

// Her draft is kept by field (RAPP-663): the screens save through her fields.
const store = wizardDraftStoreOn(
  createInMemoryOnboardingDraftStore(),
  systemFieldIndexFromCatalog(systemFieldsCatalogFixture()),
);
const pushed: string[] = [];
const haptics: string[] = [];
let wentNext = 0;
// Her review of a Nova versió (RAPP-697) is not this test's.
mock.module('@/lib/onboarding-review', () => ({
  useFinishOnboardingReview: () => async () => true,
}));
mock.module('@/lib/onboarding', () => ({ onboardingDraftStore: store }));
mock.module('@/lib/haptics/haptics', () => ({
  playHaptic: (kind: string) => void haptics.push(kind),
}));
mock.module('expo-router', () => ({
  useRouter: () => ({ push: (href: string) => void pushed.push(href), replace: () => {} }),
  useFocusEffect: () => {},
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { section?: string }) =>
      values?.section === undefined ? key : `${key}:${values.section}`,
    i18n: { resolvedLanguage: 'ca' },
  }),
}));
mock.module('@/components/onboarding/wizard-validation-summary', () => ({
  WizardValidationSummary: ({
    isVisible,
    message,
    testID,
  }: {
    isVisible: boolean;
    message: string;
    testID?: string;
  }) => (isVisible ? createElement('div', { 'data-testid': testID }, message) : null),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/profile/season-answer-rows', () => ({ SeasonAnswerRows: () => null }));
mock.module('@/components/onboarding/review-section', () => ({
  ReviewSection: ({ children }: { children: ReactNode }) =>
    createElement('section', null, children),
  ReviewRow: () => null,
  ReviewEditAction: () => null,
}));
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({ children, onContinue }: { children: ReactNode; onContinue: () => void }) =>
    createElement(
      'main',
      null,
      children,
      createElement('button', { 'data-testid': 'confirm', onClick: onContinue }, 'confirm'),
    ),
}));

// Staff moved the sizes before her name while she was at logistics.
const flow: WizardFlow = {
  order: ['equipment', 'season', 'identity', 'background', 'documentation', 'logistics'],
  hiddenScreens: new Set(),
};
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardIntake: () => ({
    customAnswers: {},
    hidden: new Set(),
    customScreens: [],
    customPlan: [],
    flow,
    catalog: EMPTY_INTAKE_CATALOG,
  }),
  useWizardStep: () => ({
    position: { step: 8, total: 10 },
    isEditing: false,
    nextDraftStep: 'terms-intro',
    goNext: () => void (wentNext += 1),
    previousDraftStep: null,
    goBack: null,
  }),
  useBuiltinWording: () => ({
    label: (_question: string, appLabel: string) => appLabel,
    help: () => null,
    options: <Option,>(_question: string, options: readonly Option[]) => options,
  }),
}));

const { default: SummaryStepScreen } = await import('@/app/(app)/onboarding/summary');
afterAll(() => mock.restore());

const identity = {
  firstName: 'Amina',
  lastName: 'Diallo',
  day: '4',
  month: '3',
  year: '1999',
  placeOfBirth: 'Bamako',
  nationality: 'Mali',
  preferredLanguage: 'ca',
};
const logistics = {
  referenceEntity: null,
  hasReferenceEntity: false,
  hasDependents: false,
  numDependents: '',
};

test('confirm is refused while the sizes are missing, and she is sent to that screen', () => {
  store.saveDraft({ currentStep: 'summary', identity, documentation: {}, logistics });
  const screen = render(createElement(SummaryStepScreen));
  expect(screen.queryByTestId('summary-missing-required')).toBeNull();
  fireEvent.click(screen.getByTestId('confirm'));
  expect(wentNext).toBe(0);
  expect(pushed).toEqual(['/onboarding/equipment?edit=1']);
  expect(haptics).toEqual(['warning']);
  expect(screen.getByTestId('summary-missing-required').textContent).toBe(
    'summaryMissingRequired:equipmentTitle',
  );
  screen.unmount();
});

test('with every required answer given, confirm goes on to the terms', () => {
  store.saveDraft({
    currentStep: 'summary',
    identity,
    documentation: {},
    logistics: { ...logistics, clothingSize: 'M', shoeSize: '38' },
  });
  const screen = render(createElement(SummaryStepScreen));
  fireEvent.click(screen.getByTestId('confirm'));
  expect(wentNext).toBe(1);
  expect(store.loadDraft()?.currentStep).toBe('terms-intro');
  screen.unmount();
});
