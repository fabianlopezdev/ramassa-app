/**
 * The terms at the end of her Onboarding (RAPP-21, RAPP-772): the terms form's
 * screens, one wizard step each. "Ara no" asks first, then saves her draft at
 * the terms and signs her out. Finishing on the last terms screen sends her
 * Onboarding and her acceptance in one call. Terms this build cannot read
 * never let her through. These terms come from an older server's content,
 * read as the terms form, so they finish with the old acceptance.
 */
import { wizardDraftStoreOn } from '@/lib/wizard-draft';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { AlertButton, AlertOptions } from 'react-native';
import { LEGACY_TERMS_IDS } from '@ramassa/shared/intake';
import {
  parseIntakeCatalog,
  systemFieldIndexFromCatalog,
  withAppTermsForm,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import { createInMemoryOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';

const text = (value: string) => ({ ca: value });
const VERSION_ID = '5eed0000-0000-4000-8099-000000000002';
const SIGN_STEP = `terms:${LEGACY_TERMS_IDS.signScreen}` as const;
const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
const store = wizardDraftStoreOn(createInMemoryOnboardingDraftStore(), fields);
const platform = { OS: 'ios', Version: '27' };
const alert = mock<
  (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => void
>(() => {});
const refreshProfile = mock(async () => {});
const goNext = mock(() => {});
const goBack = mock(() => {});
const refetchQueries = mock(async () => {});
const complete = mock<
  (payload: unknown, signing: unknown) => Promise<{ ok: true; value: undefined }>
>(async () => ({ ok: true as const, value: undefined }));
const logout = mock(async () => {
  expect(store.loadDraft()?.currentStep).toBe(SIGN_STEP);
  return { ok: true as const, value: undefined };
});
let screenId: string = LEGACY_TERMS_IDS.signScreen;
const readable: IntakeCatalog = withAppTermsForm(
  parseIntakeCatalog({
    screens: [],
    overrides: [],
    presets: [],
    terms: {
      id: VERSION_ID,
      version_number: 2,
      content: {
        title: text('Termes i condicions'),
        body: text('Text legal complet.'),
        intro_title: text('Abans dels termes'),
        intro: text('Llegeix-los.'),
        points: [{ title: text('Per què'), body: text('Per organitzar.') }],
        accept_label: text('He llegit i accepto els termes'),
        media_label: text('Fotos i vídeos'),
        media_hint: text('Pots canviar-ho quan vulguis.'),
      },
    },
  }),
);
let catalog: IntakeCatalog = readable;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve() },
  Alert: { alert },
  Platform: platform,
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/lib/auth', () => ({ logout }));
mock.module('@/components/authorization/signature-section', () => ({
  SignatureSection: ({ onChange }: { onChange: (value: number[][][]) => void }) =>
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
}));
mock.module('@/lib/onboarding', () => ({
  onboardingDraftStore: { ...store, clearUserDraft: () => store.clearDraft() },
  completeOnboarding: complete,
}));
mock.module('@/lib/onboarding-answers', () => ({
  onboardingAnswersFromDraft: () => ({
    ok: true,
    value: {
      first_name: 'Laia',
      last_name: 'Prova',
      preferred_language: 'ca',
      answers: {},
      signatures: {},
    },
  }),
}));
mock.module('@ramassa/shared/auth', () => ({
  useAuth: () => ({ refreshProfile, user: { id: 'test-player' } }),
}));
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardIntake: () => ({ catalog, customAnswers: {}, customScreens: [], customPlan: [] }),
  useWizardStep: () => ({
    position: { step: 15, total: 15 },
    nextDraftStep: SIGN_STEP,
    previousDraftStep: 'summary',
    goBack,
    goNext,
  }),
}));
mock.module('@tanstack/react-query', () => ({
  useQueryClient: () => ({ refetchQueries }),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('expo-router', () => ({
  useLocalSearchParams: () => ({ screenId }),
  useNavigation: () => ({ getState: () => undefined }),
  useRouter: () => ({ replace: () => {} }),
  Redirect: () => createElement('span', null, 'redirect'),
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }),
}));
mock.module('@/components/error-code-line', () => ({ FailureNotice: () => null }));
mock.module('@/components/announcements/feed-states', () => ({
  AnnouncementFeedError: ({ message, onRetry }: { message: string; onRetry: () => void }) =>
    createElement('button', { onClick: onRetry }, message),
}));
mock.module('@/components/forms/text-block', () => ({
  TextBlock: ({ body }: { body: string }) => createElement('p', null, body),
}));
mock.module('@/components/forms/points-block', () => ({
  PointsBlock: () => createElement('ul', null),
}));
mock.module('@/components/onboarding/custom-question-field', () => ({
  CustomQuestionField: () => null,
}));
mock.module('@/components/onboarding/wizard-validation-summary', () => ({
  WizardValidationSummary: ({ isVisible, message }: { isVisible: boolean; message: string }) =>
    isVisible ? createElement('p', null, message) : null,
}));
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
  }: {
    children: ReactNode;
    title: string;
    intro?: string;
    stepNumber: number;
    totalSteps: number;
    continueLabel: string;
    onContinue: () => void;
  }) =>
    createElement(
      'main',
      { 'data-testid': 'terms-frame', 'data-step': stepNumber, 'data-total': totalSteps },
      createElement('h1', null, title),
      intro ? createElement('p', null, intro) : null,
      children,
      createElement('button', { onClick: onContinue }, continueLabel),
    ),
}));
const { default: TermsStep } = await import('../../app/(app)/onboarding/terms/[screenId]');
afterAll(() => mock.restore());
beforeEach(() => {
  refreshProfile.mockClear();
  goNext.mockClear();
  alert.mockClear();
  logout.mockClear();
  complete.mockClear();
  refetchQueries.mockClear();
  catalog = readable;
  screenId = LEGACY_TERMS_IDS.signScreen;
  store.saveDraft({ currentStep: SIGN_STEP, identity: { firstName: 'Laia' }, custom: {} });
});

test('the complete legal text, the acceptance, the photo choice and the signature are on the screen she signs', () => {
  const screen = render(createElement(TermsStep));
  expect(screen.getByRole('heading', { name: 'Termes i condicions' })).toBeTruthy();
  expect(screen.getByText('Text legal complet.')).toBeTruthy();
  expect(screen.getByText('Pots canviar-ho quan vulguis.')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'He llegit i accepto els termes' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Fotos i vídeos' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'finishAction' })).toBeTruthy();
});

test('Not now asks first; cancelling leaves the session and draft untouched', () => {
  const before = store.loadDraft();
  const screen = render(createElement(TermsStep));
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = alert.mock.calls[0]!;
  expect(title).toBe('termsLeaveTitle');
  expect(message).toBe('termsLeaveBody');
  buttons?.[0]?.onPress?.();
  expect(logout).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  expect(store.loadDraft()).toEqual(before);
});

test('confirming keeps her draft at the terms before signing out', () => {
  const screen = render(createElement(TermsStep));
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  alert.mock.calls[0]?.[2]?.[1]?.onPress?.();
  expect(logout).toHaveBeenCalledTimes(1);
  expect(store.loadDraft()?.identity).toEqual({ firstName: 'Laia' });
});

test('nothing is sent until she accepts and signs; then her Onboarding and acceptance go together', async () => {
  const screen = render(createElement(TermsStep));
  fireEvent.click(screen.getByRole('button', { name: 'finishAction' }));
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'He llegit i accepto els termes' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Fotos i vídeos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Draw app signature' }));
  fireEvent.click(screen.getByRole('button', { name: 'finishAction' }));
  await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
  expect(complete).toHaveBeenCalledTimes(1);
  const [request, signing] = complete.mock.calls[0]!;
  // An older server's terms: the old acceptance, with the version and language she was shown.
  expect(request).toEqual(
    expect.objectContaining({ media_consent: true, terms_version: '2', locale_shown: 'ca' }),
  );
  expect(signing).toEqual({
    terms_accepted: true,
    media_consent: true,
    signature: [
      [
        [1, 2],
        [3, 4],
      ],
    ],
    unable_to_draw: false,
    device: 'ios 27',
  });
});

test('the introduction moves on through the wizard and sends nothing', () => {
  screenId = LEGACY_TERMS_IDS.introScreen;
  const screen = render(createElement(TermsStep));
  expect(screen.getByRole('heading', { name: 'Abans dels termes' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'continueAction' }));
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(complete).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'termsDeclineAction' })).toBeNull();
});

test('terms this build cannot read never let her through: she tries again', () => {
  catalog = parseIntakeCatalog({ screens: [], overrides: [], presets: [], terms: null });
  const screen = render(createElement(TermsStep));
  expect(screen.queryByRole('button', { name: 'finishAction' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'termsUpdateLoadFailed' }));
  expect(refetchQueries).toHaveBeenCalledTimes(1);
});
