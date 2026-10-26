import { wizardDraftStoreOn } from '@/lib/wizard-draft';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
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
let refreshed = 0;
const calls: { name: string; args: Record<string, unknown> }[] = [];
let failNext = false;
mock.module('@/lib/supabase', () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return failNext ? { error: { message: 'down' } } : { error: null };
    },
  },
}));
mock.module('@/lib/onboarding-review', () => ({
  useRefreshOnboardingReview: () => async () => void (refreshed += 1),
}));
mock.module('@ramassa/shared/auth', () => ({ useAuth: () => ({ user: { id: 'her' } }) }));
mock.module('@/lib/observability', () => ({
  safeAsync: async (operation: () => Promise<unknown>) => {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      return { ok: false, error };
    }
  },
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

// She reviews the sizes screen, saved as a Nova versió since she joined.
const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardIntake: () => ({
    customAnswers: {},
    hidden: new Set(),
    customScreens: [],
    customPlan: [],
    fields,
    flow: { order: [], hiddenScreens: new Set() },
    catalog: EMPTY_INTAKE_CATALOG,
    review: ['equipment'],
  }),
  useWizardStep: () => ({
    position: { step: 2, total: 2 },
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
  clothingSize: 'M',
  shoeSize: '38',
};

test('a failed save says so and keeps her on the summary', async () => {
  store.saveDraft({ currentStep: 'summary', identity, documentation: {}, logistics });
  failNext = true;
  const screen = render(createElement(SummaryStepScreen));
  fireEvent.click(screen.getByTestId('confirm'));
  await waitFor(() => expect(screen.getByTestId('summary-review-failed')).toBeTruthy());
  expect(refreshed).toBe(0);
  expect(haptics.at(-1)).toBe('error');
  screen.unmount();
  failNext = false;
  calls.length = 0;
});

test('her review saves her answers with the Onboarding writers and opens the app (RAPP-697)', async () => {
  store.saveDraft({ currentStep: 'summary', identity, documentation: {}, logistics });
  const screen = render(createElement(SummaryStepScreen));
  fireEvent.click(screen.getByTestId('confirm'));
  await waitFor(() => expect(refreshed).toBe(1));
  expect(wentNext).toBe(0);
  expect(calls.map((call) => call.name)).toEqual(['complete_onboarding_review']);
  const payload = calls[0]?.args['payload'] as Record<string, unknown>;
  // Her names only when her review asked them.
  expect(payload['first_name']).toBeUndefined();
  expect(Object.keys(payload['answers'] as object).length).toBeGreaterThan(0);
  expect(haptics.at(-1)).toBe('success');
  screen.unmount();
});
