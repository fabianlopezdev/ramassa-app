import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { AlertButton, AlertOptions } from 'react-native';
import { createInMemoryOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';

const store = createInMemoryOnboardingDraftStore();
const platform = { OS: 'ios' };
const alert = mock<
  (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => void
>(() => {});
const refreshProfile = mock(async () => {});
const goNext = mock(() => {});
const goBack = mock(() => {});
const complete = mock<
  (payload: unknown, signing: unknown) => Promise<{ ok: true; value: undefined }>
>(async () => ({ ok: true as const, value: undefined }));
const logout = mock(async () => {
  expect(store.loadDraft()?.currentStep).toBe('terms');
  return { ok: true as const, value: undefined };
});
mock.module('react-native', () => ({
  Alert: { alert },
  Platform: platform,
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/lib/auth', () => ({ logout }));
mock.module('@/components/authorization/signature-section', () => ({
  SignatureSection: ({
    onChange,
    hasError,
  }: {
    onChange: (value: number[][][]) => void;
    hasError: boolean;
  }) =>
    createElement(
      'div',
      null,
      createElement(
        'button',
        {
          onClick: () =>
            onChange([
              [
                [1, 2],
                [3, 4],
              ],
            ]),
        },
        'Draw app signature',
      ),
      hasError ? createElement('span', null, 'authorizationErrorSignature') : null,
    ),
}));
mock.module('@/lib/onboarding', () => ({
  onboardingDraftStore: { ...store, clearUserDraft: () => store.clearDraft() },
  completeOnboarding: complete,
  saveWizardCustomAnswers: mock(async () => ({ ok: true, value: undefined })),
}));
mock.module('@ramassa/shared/auth', () => ({
  useAuth: () => ({ refreshProfile, user: { id: 'test-player' } }),
}));
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardIntake: () => ({
    profile: null,
    answered: new Set(),
    customScreens: [],
    customAnswers: {},
  }),
  useWizardStep: (screen: string) => ({
    position: { step: screen === 'terms-intro' ? 14 : 15, total: 15 },
    nextDraftStep: 'terms',
    previousDraftStep: screen === 'terms' ? 'terms-intro' : 'summary',
    goBack,
    goNext,
  }),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('expo-router', () => ({ useRouter: () => ({ replace: () => {} }) }));
mock.module('@/components/forms/data-icon', () => ({
  DataIcon: () => createElement('span', { 'data-testid': 'privacy-icon' }),
}));
mock.module('expo-symbols', () => ({ SymbolView: () => null }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }),
}));
mock.module('@/components/error-code-line', () => ({ FailureNotice: () => null }));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
}));
mock.module('@/components/authorization/consent-row', () => ({
  ConsentRow: ({
    label,
    onToggle,
    checked,
  }: {
    label: string;
    onToggle: () => void;
    checked: boolean;
  }) =>
    createElement(
      'button',
      { onClick: onToggle, role: 'checkbox', 'aria-checked': checked },
      label,
    ),
}));
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({
    children,
    title,
    intro,
    stepNumber,
    totalSteps,
    continueLabel,
    onContinue,
    onBack,
  }: {
    children: ReactNode;
    title: string;
    intro?: string;
    stepNumber: number;
    totalSteps: number;
    continueLabel: string;
    onContinue: () => void;
    onBack: () => void;
  }) =>
    createElement(
      'main',
      { 'data-testid': 'terms-frame', 'data-step': stepNumber, 'data-total': totalSteps },
      createElement('h1', null, title),
      intro ? createElement('p', null, intro) : null,
      children,
      createElement('button', { onClick: onContinue }, continueLabel),
      createElement('button', { onClick: onBack }, 'Back'),
    ),
}));
const { default: Terms } = await import('../../app/(app)/onboarding/terms');
const { TermsIntroductionStep } = await import('./terms-introduction');
const { confirmDelete } = await import('@/lib/confirm-delete');
afterAll(() => mock.restore());
beforeEach(() => {
  refreshProfile.mockClear();
  goNext.mockClear();
  goBack.mockClear();
  alert.mockClear();
  logout.mockClear();
  complete.mockClear();
  platform.OS = 'ios';
  store.saveDraft({
    currentStep: 'terms',
    identity: { firstName: 'Laia' },
    documentation: { documentType: 'none' },
    logistics: { hasDependents: false },
    season: { specificNeeds: 'An interpreter' },
    custom: { transport: 'yes' },
  });
});

test('Not now asks first; cancelling leaves the session and draft untouched', () => {
  const before = store.loadDraft();
  const screen = render(createElement(Terms));
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  expect(alert).toHaveBeenCalledTimes(1);
  expect(logout).not.toHaveBeenCalled();
  const [title, message, buttons, options] = alert.mock.calls[0]!;
  expect(title).toBe('termsLeaveTitle');
  expect(message).toBe('termsLeaveBody');
  expect(options?.cancelable).toBe(true);
  expect(buttons?.[0]?.text).toBe('termsLeaveStayAction');
  expect(buttons?.[0]?.style).toBe('cancel');
  buttons?.[0]?.onPress?.();
  expect(logout).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  expect(store.loadDraft()).toEqual(before);
});

test('confirming saves the complete draft and current consent choices before signing out', () => {
  const before = store.loadDraft();
  const screen = render(createElement(Terms));
  fireEvent.click(screen.getByRole('checkbox', { name: 'mediaConsentLabel' }));
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  const buttons = alert.mock.calls[0]?.[2];
  expect(buttons?.[1]?.text).toBe('termsLeaveConfirmAction');
  buttons?.[1]?.onPress?.();
  expect(logout).toHaveBeenCalledTimes(1);
  expect(store.loadDraft()).toEqual({
    ...before,
    currentStep: 'terms',
    terms: {
      termsAccepted: false,
      mediaConsent: true,
      strokes: null,
      unableToDraw: false,
      signatureOwnerId: 'test-player',
    },
  });
  expect(complete).not.toHaveBeenCalled();
});

test('browser cancellation keeps the draft; explicit browser confirmation signs out', () => {
  platform.OS = 'web';
  const confirm = spyOn(window, 'confirm').mockReturnValue(false);
  const screen = render(createElement(Terms));
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  expect(confirm).toHaveBeenLastCalledWith('termsLeaveTitle\n\ntermsLeaveBody');
  expect(logout).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  expect(logout).toHaveBeenCalledTimes(1);
  expect(alert).not.toHaveBeenCalled();
  confirm.mockRestore();
});

test('existing delete confirmation retains its explicit destructive action', () => {
  const onConfirm = mock(() => {});
  confirmDelete('Delete this note?', onConfirm, ['Cancel', 'Delete']);
  expect(onConfirm).not.toHaveBeenCalled();
  const [title, body, buttons] = alert.mock.calls[0]!;
  expect(title).toBe('Delete this note?');
  expect(body).toBeUndefined();
  expect(buttons?.[1]?.style).toBe('destructive');
  buttons?.[1]?.onPress?.();
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('the introduction explains the next screen and preserves answers on Continue and Back', () => {
  const before = store.loadDraft();
  let view = render(createElement(TermsIntroductionStep));
  expect(view.getByRole('heading').textContent).toBe('termsIntroTitle');
  expect(view.getByText('termsIntro')).toBeTruthy();
  expect(view.getAllByTestId('privacy-icon')).toHaveLength(4);
  expect(view.queryByText('termsBody')).toBeNull();
  expect(view.queryByRole('checkbox', { name: 'termsAcceptLabel' })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'termsReadFullAction' }));
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(store.loadDraft()).toEqual({ ...before, currentStep: 'terms' });
  expect(complete).not.toHaveBeenCalled();
  view.unmount();
  view = render(createElement(TermsIntroductionStep));
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(goBack).toHaveBeenCalledTimes(1);
  expect(store.loadDraft()).toEqual({ ...before, currentStep: 'summary' });
});
test('the complete legal text is visible immediately, before explicit acceptance options', () => {
  const view = render(createElement(Terms));
  const subtitle = view.getByText('mediaConsentHint');
  expect(subtitle.tagName).toBe('P');
  expect(view.getAllByText('mediaConsentHint')).toHaveLength(1);
  expect(view.queryByText('termsNextStepHint')).toBeNull();
  const body = view.getByText('termsBody');
  expect(subtitle.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const accept = view.getByRole('checkbox', { name: 'termsAcceptLabel' });
  expect(body.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(accept.getAttribute('aria-checked')).toBe('false');
  expect(
    view.getByRole('checkbox', { name: 'mediaConsentLabel' }).getAttribute('aria-checked'),
  ).toBe('false');
  expect(view.queryByRole('button', { name: 'termsReadFullAction' })).toBeNull();
  expect(view.queryByRole('button', { name: 'termsHideFullAction' })).toBeNull();
  expect(view.queryByText('termsPointPurposeTitle')).toBeNull();
});

test('app terms end at 15 of 15 and require their own saved signature', async () => {
  store.saveDraft({
    currentStep: 'terms',
    identity: {
      firstName: 'Laia',
      lastName: 'Coromines',
      day: '30',
      month: '12',
      year: '1995',
      placeOfBirth: 'Vic',
      nationality: 'Espanya',
      preferredLanguage: 'ca',
    },
    documentation: { documentType: 'none' },
    logistics: { referenceEntity: null, hasDependents: false, clothingSize: 'M', shoeSize: '38' },
  });
  const view = render(createElement(Terms));
  expect(view.getByTestId('terms-frame').getAttribute('data-step')).toBe('15');
  expect(view.getByTestId('terms-frame').getAttribute('data-total')).toBe('15');
  fireEvent.click(view.getByRole('button', { name: 'finishAction' }));
  expect(view.getByText('errorTermsRequired')).toBeTruthy();
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('checkbox', { name: 'termsAcceptLabel' }));
  fireEvent.click(view.getByRole('button', { name: 'finishAction' }));
  expect(view.getByText('authorizationErrorSignature')).toBeTruthy();
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: 'Draw app signature' }));
  fireEvent.click(view.getByRole('button', { name: 'finishAction' }));
  await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
  expect(complete).toHaveBeenCalledTimes(1);
  expect(complete.mock.calls[0]?.[1]).toMatchObject({
    termsAccepted: true,
    mediaConsent: false,
    unableToDraw: false,
    strokes: [
      [
        [1, 2],
        [3, 4],
      ],
    ],
  });
  expect(store.loadDraft()).toBeNull();
});

test('a saved signature from another account is never shown or used', () => {
  store.saveDraft({
    currentStep: 'terms',
    terms: {
      termsAccepted: true,
      mediaConsent: true,
      strokes: [[[1, 2]]],
      unableToDraw: false,
      signatureOwnerId: 'someone-else',
    },
  });
  const view = render(createElement(Terms));
  expect(
    view.getByRole('checkbox', { name: 'termsAcceptLabel' }).getAttribute('aria-checked'),
  ).toBe('false');
  expect(
    view.getByRole('checkbox', { name: 'mediaConsentLabel' }).getAttribute('aria-checked'),
  ).toBe('false');
  fireEvent.click(view.getByRole('checkbox', { name: 'termsAcceptLabel' }));
  fireEvent.click(view.getByRole('button', { name: 'finishAction' }));
  expect(view.getByText('authorizationErrorSignature')).toBeTruthy();
  expect(complete).not.toHaveBeenCalled();
});
