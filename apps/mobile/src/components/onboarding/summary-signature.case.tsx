import { wizardDraftStoreOn } from '@/lib/wizard-draft';
import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { WizardFlow } from '@ramassa/shared/intake';
import {
  EMPTY_INTAKE_CATALOG,
  systemFieldIndexFromCatalog,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import { createInMemoryOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';

// Her draft is kept by field (RAPP-663); it keeps her unsent signatures (RAPP-690).
const store = wizardDraftStoreOn(
  createInMemoryOnboardingDraftStore(),
  systemFieldIndexFromCatalog(systemFieldsCatalogFixture()),
);
// Her review of a Nova versió (RAPP-697) is not this test's.
mock.module('@/lib/onboarding-review', () => ({
  useFinishOnboardingReview: () => async () => true,
}));
mock.module('@/lib/onboarding', () => ({ onboardingDraftStore: store }));
mock.module('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useFocusEffect: () => {},
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
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
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/profile/season-answer-rows', () => ({ SeasonAnswerRows: () => null }));
mock.module('@/components/onboarding/review-section', () => ({
  ReviewSection: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement('section', null, createElement('h2', null, title), children),
  ReviewRow: ({ label, value }: { label: string; value: string }) =>
    createElement('p', null, `${label}: ${value}`),
  ReviewEditAction: () => null,
}));
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({ children }: { children: ReactNode }) => createElement('main', null, children),
}));

const transport: IntakeScreen = {
  id: 'transport',
  title: { ca: 'Transport' },
  intro: null,
  afterScreen: 'logistics',
  isArchived: false,
  questions: [],
};
const flow: WizardFlow = { order: [], hiddenScreens: new Set() };
const hidden = new Set<string>();
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardIntake: () => ({
    customAnswers: {},
    hidden,
    customScreens: [transport],
    customPlan: [{ id: 'transport', afterScreen: 'logistics', isAnswered: false }],
    // Signed on the walk-in tablet, text unchanged (RAPP-691).
    signedBlocks: [
      {
        id: 'b-tablet',
        surface: 'onboarding',
        screenKey: 'logistics',
        kind: 'signature',
        body: { ca: 'Accepto el codi de conducta' },
        sortOrder: 0,
      },
    ],
    flow,
    catalog: {
      ...EMPTY_INTAKE_CATALOG,
      blocks: [
        {
          id: 'b-signed',
          surface: 'onboarding',
          screenKey: 'transport',
          kind: 'signature',
          body: { ca: 'Autoritzo que em portin amb cotxe' },
          sortOrder: 0,
        },
        {
          id: 'b-open',
          surface: 'onboarding',
          screenKey: 'transport',
          kind: 'signature',
          body: { ca: 'Accepto les normes' },
          sortOrder: 1,
        },
      ],
    },
  }),
  useWizardStep: () => ({
    position: { step: 8, total: 10 },
    isEditing: false,
    nextDraftStep: 'terms-intro',
    goNext: () => {},
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

test('the summary lists each signature block she signed, its text marked as signed (RAPP-690)', () => {
  store.saveDraft({
    currentStep: 'summary',
    signatures: {
      'b-signed': [
        [
          [10, 20],
          [30, 40],
        ],
      ],
      'b-open': null,
    },
  });
  const screen = render(createElement(SummaryStepScreen));
  const text = screen.container.textContent ?? '';
  expect(text).toContain('Autoritzo que em portin amb cotxe: summarySigned');
  expect(text).not.toContain('Accepto les normes');
  // The ones she signed on the walk-in tablet close the summary (RAPP-691).
  expect(text).toContain('summarySignaturesTitle');
  expect(text).toContain('Accepto el codi de conducta: summarySigned');
  screen.unmount();
});
