import type { WizardIntake } from '@/lib/onboarding-intake-context';
import { createWizardDraftStore } from '@/lib/wizard-draft';
import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import { createAccountOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';

const backing = new Map<string, string>();
const accountStore = createAccountOnboardingDraftStore({
  getString: (key) => backing.get(key),
  set: (key, value) => void backing.set(key, value),
  remove: (key) => backing.delete(key),
});
const store = createWizardDraftStore(accountStore);
const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
let userId = 'player-a';
const refetch = mock(async () => {});
const observed: { userId: string; firstName: unknown }[] = [];
const ready = {
  names: {},
  fields,
  customAnswers: {},
  customScreens: [],
  answered: new Set(),
  notAsked: new Set(),
  customPlan: [],
} as unknown as WizardIntake;
let query: {
  data: WizardIntake | undefined;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  fetchStatus: 'fetching' | 'paused' | 'idle';
};
const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
mock.module('@/lib/onboarding', () => ({ onboardingDraftStore: store }));
mock.module('@/lib/supabase', () => ({ supabase: {} }));
mock.module('@/lib/observability', () => ({ logger: { warn: () => {}, error: () => {} } }));
mock.module('@ramassa/shared/profile', () => ({ fetchOwnProfile: mock(async () => null) }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@tanstack/react-query', () => ({ useQuery: () => ({ ...query, refetch }) }));
mock.module('@ramassa/shared/auth', () => ({ useAuth: () => ({ user: { id: userId } }) }));
mock.module('@ramassa/shared/i18n', () => ({ useLanguage: () => ({ language: 'ca' }) }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
mock.module('react-native', () => ({ View: box, Text: box }));
mock.module('expo-router/stack', () => ({
  Stack: () => {
    const firstName = store.loadDraft()?.identity?.firstName;
    observed.push({ userId, firstName });
    return createElement('p', { 'data-testid': 'wizard' }, (firstName as string) ?? 'new player');
  },
}));
mock.module('@/lib/onboarding-intake-context', () => ({ WizardIntakeProvider: box }));
mock.module('@/components/announcements/feed-states', () => ({
  AnnouncementFeedSkeleton: () => createElement('p', { role: 'progressbar' }, 'Loading'),
  AnnouncementFeedError: ({
    message,
    onRetry,
    retryLabel,
  }: {
    message: string;
    onRetry: () => void;
    retryLabel: string;
  }) =>
    createElement(
      'div',
      null,
      createElement('p', { role: 'alert' }, message),
      createElement('button', { onClick: onRetry }, retryLabel),
    ),
}));
const { default: OnboardingLayout } = await import('../../app/(app)/onboarding/_layout');
afterAll(() => mock.restore());
beforeEach(() => {
  backing.clear();
  store.setUser(null);
  userId = 'player-a';
  refetch.mockClear();
  observed.length = 0;
  query = { data: ready, isError: false, isFetching: false, error: null, fetchStatus: 'idle' };
});

test('the wizard binds each account before children read its draft and restores only that account', () => {
  // A draft from before RAPP-663, as her phone kept it: converted when she comes back.
  accountStore.setUser('player-a');
  accountStore.saveDraft({ currentStep: 'terms', identity: { firstName: 'Amina' } });
  accountStore.setUser(null);
  const view = render(createElement(OnboardingLayout));
  expect(view.getByTestId('wizard').textContent).toBe('Amina');
  expect(store.loadStoredDraft()).toMatchObject({
    version: 2,
    account: { firstName: 'Amina', preferredLanguage: 'ca' },
  });
  userId = 'player-b';
  view.rerender(createElement(OnboardingLayout));
  expect(view.getByTestId('wizard').textContent).toBe('new player');
  expect(store.loadDraft()?.identity?.firstName).toBeUndefined();
  expect(
    observed
      .filter((rendered) => rendered.userId === 'player-b')
      .every((rendered) => rendered.firstName !== 'Amina'),
  ).toBe(true);
  userId = 'player-a';
  view.rerender(createElement(OnboardingLayout));
  expect(view.getByTestId('wizard').textContent).toBe('Amina');
  view.unmount();
  expect(store.loadDraft()).toBeNull();
});

test('paused initial loading explains the missing connection, permits retry and resumes normally', () => {
  query = { ...query, data: undefined, fetchStatus: 'paused' };
  const view = render(createElement(OnboardingLayout));
  expect(view.getByRole('alert').textContent).toBe('errors:NETWORK-1');
  expect(view.queryByRole('progressbar') === null).toBe(true);
  fireEvent.click(view.getByRole('button', { name: 'retryAction' }));
  expect(refetch).toHaveBeenCalledTimes(1);
  query = { ...query, fetchStatus: 'fetching', isFetching: true };
  view.rerender(createElement(OnboardingLayout));
  expect(view.getByRole('progressbar').textContent).toBe('Loading');
  query = { ...query, data: ready, fetchStatus: 'idle', isFetching: false };
  view.rerender(createElement(OnboardingLayout));
  expect(view.getByTestId('wizard').textContent).toBe('new player');
});

test('a background refetch failure keeps the current form and answers mounted', () => {
  const view = render(createElement(OnboardingLayout));
  const wizard = view.getByTestId('wizard');
  query = { ...query, isError: true, error: new TypeError('Offline') };
  view.rerender(createElement(OnboardingLayout));
  expect(view.getByTestId('wizard')).toBe(wizard);
  expect(view.queryByRole('alert') === null).toBe(true);
});
