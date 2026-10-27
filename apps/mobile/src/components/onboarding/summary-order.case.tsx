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

// Her draft is kept by field (RAPP-663): the screens save through her fields.
const store = wizardDraftStoreOn(
  createInMemoryOnboardingDraftStore(),
  systemFieldIndexFromCatalog(systemFieldsCatalogFixture()),
);
mock.module('@/lib/onboarding', () => ({ onboardingDraftStore: store }));
mock.module('expo-router', () => ({
  useNavigation: () => ({ getState: () => undefined }),
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
  ReviewRow: () => null,
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
let flow: WizardFlow = { order: [], hiddenScreens: new Set() };
let hidden = new Set<string>();
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardIntake: () => ({
    customAnswers: {},
    hidden,
    customScreens: [transport],
    customPlan: [{ id: 'transport', afterScreen: 'logistics', isAnswered: false }],
    flow,
    catalog: EMPTY_INTAKE_CATALOG,
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

const sectionTitles = (container: HTMLElement) =>
  [...container.querySelectorAll('h2')].map((heading) => heading.textContent);

test("with no stored order the summary keeps the app's own order", () => {
  flow = { order: [], hiddenScreens: new Set() };
  const screen = render(createElement(SummaryStepScreen));
  expect(sectionTitles(screen.container)).toEqual([
    'summarySectionName',
    'backgroundTitle',
    'documentationTitle',
    'logisticsTitle',
    'equipmentTitle',
    'Transport',
    'currentSituationTitle',
    'supportingOrganisationsTitle',
    'participationSupportTitle',
    'supportNeedsTitle',
  ]);
  screen.unmount();
});

test('the summary groups follow the order staff arranged, and a hidden screen has no group', () => {
  flow = {
    order: ['custom:transport', 'season', 'identity', 'background', 'documentation', 'logistics'],
    hiddenScreens: new Set(['documentation']),
  };
  hidden = new Set(['document']);
  const screen = render(createElement(SummaryStepScreen));
  expect(sectionTitles(screen.container).slice(0, 5)).toEqual([
    'Transport',
    'currentSituationTitle',
    'supportingOrganisationsTitle',
    'participationSupportTitle',
    'supportNeedsTitle',
  ]);
  expect(sectionTitles(screen.container)).not.toContain('documentationTitle');
  screen.unmount();
});
