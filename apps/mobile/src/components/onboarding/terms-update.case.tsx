/**
 * A new app terms version (RAPP-613): the player who joined walks its screens
 * (RAPP-772) and accepts it there; her acceptance names the version and the
 * language she was shown, with her signature and her photo choice, which
 * opens on her current one. These terms come from an older server's content,
 * read as the terms form, so they are accepted with the old call.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { AlertButton } from 'react-native';
import { parseIntakeCatalog, withAppTermsForm } from '@ramassa/shared/intake-builder';

const VERSION_ID = '5eed0000-0000-4000-8099-000000000002';
const text = (value: string) => ({ ca: value });
const terms = {
  id: VERSION_ID,
  version_number: 2,
  content: {
    title: text('Termes nous'),
    body: text('Text legal nou de l’entitat.'),
    intro_title: text('Abans'),
    intro: text('Llegeix.'),
    points: [{ title: text('Per què'), body: text('Per organitzar.') }],
    accept_label: text('Accepto els termes nous'),
    media_label: text('Fotos i vídeos'),
    media_hint: text('Pots canviar-ho quan vulguis.'),
  },
};
const rpc = mock<(name: string, args: unknown) => Promise<{ data: null; error: null }>>(
  async () => ({ data: null, error: null }),
);
const refreshProfile = mock(async () => {});
const logout = mock(async () => ({ ok: true as const, value: undefined }));
const alert = mock<(title: string, message?: string, buttons?: AlertButton[]) => void>(() => {});

mock.module('react-native', () => ({
  Alert: { alert },
  Platform: { OS: 'android', Version: 35 },
  ActivityIndicator: () => createElement('span', null, 'loading'),
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
const refetch = mock(async () => {});
const catalog = withAppTermsForm(
  parseIntakeCatalog({ screens: [], overrides: [], presets: [], terms }),
);
type QueryState = {
  data: { catalog: typeof catalog; answers: object; mediaConsent: boolean } | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: typeof refetch;
  error?: Error;
};
const loaded: QueryState = {
  data: { catalog, answers: {}, mediaConsent: true },
  isError: false,
  isFetching: false,
  refetch,
};
let queryState: QueryState = loaded;
mock.module('@tanstack/react-query', () => ({
  useQuery: () => queryState,
  // Imported, never called, by modules the screen pulls in.
  useMutation: () => ({}),
  useQueryClient: () => ({}),
  useInfiniteQuery: () => ({}),
  QueryClient: class {},
}));
mock.module('@/lib/supabase', () => ({ supabase: { rpc } }));
mock.module('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({}),
  useRouter: () => ({}),
  Redirect: () => null,
}));
mock.module('@/lib/onboarding', () => ({
  onboardingDraftStore: { loadDraft: () => null, loadStoredDraft: () => null },
}));
mock.module('@/lib/auth', () => ({ logout }));
mock.module('@ramassa/shared/auth', () => ({
  useAuth: () => ({ refreshProfile, user: { id: 'joined-player' } }),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }),
}));
mock.module('@/components/error-code-line', () => ({
  FailureNotice: ({ code, message }: { code: string; message: string }) =>
    createElement('div', null, createElement('span', null, `failure ${code}`), message),
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
mock.module('@/components/authorization/signature-section', () => ({
  SignatureSection: ({
    onUnableToDrawChange,
  }: {
    onUnableToDrawChange: (value: boolean) => void;
  }) => createElement('button', { onClick: () => onUnableToDrawChange(true) }, 'I cannot draw'),
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
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({
    children,
    title,
    intro,
    stepNumber,
    continueLabel,
    onContinue,
  }: {
    children: ReactNode;
    title: string;
    intro?: string;
    stepNumber?: number;
    continueLabel: string;
    onContinue: () => void;
  }) =>
    createElement(
      'main',
      { 'data-testid': 'terms-update-frame', 'data-step': String(stepNumber) },
      createElement('h1', null, title),
      intro ? createElement('p', null, intro) : null,
      children,
      createElement('button', { onClick: onContinue }, continueLabel),
    ),
}));

const { default: TermsUpdate } = await import('../../app/(app)/terms-update');
afterAll(() => mock.restore());
beforeEach(() => {
  queryState = loaded;
  refetch.mockClear();
  rpc.mockClear();
  refreshProfile.mockClear();
  logout.mockClear();
  alert.mockClear();
});

/** From the introduction to the screen she signs. */
function toTheTerms(screen: ReturnType<typeof render>) {
  expect(screen.getByRole('heading', { name: 'Abans' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'continueAction' }));
}

test('she reads the published version, with no wizard progress around it', () => {
  const screen = render(createElement(TermsUpdate));
  toTheTerms(screen);
  expect(screen.getByRole('heading', { name: 'Termes nous' })).toBeTruthy();
  expect(screen.getByText('Text legal nou de l’entitat.')).toBeTruthy();
  expect(screen.getByText('Pots canviar-ho quan vulguis.')).toBeTruthy();
  expect(screen.getByTestId('terms-update-frame').getAttribute('data-step')).toBe('2');
  // Her current photo choice is kept, never withdrawn silently.
  expect(
    screen.getByRole('checkbox', { name: 'Fotos i vídeos' }).getAttribute('aria-checked'),
  ).toBe('true');
});

test('nothing is sent until she ticks the acceptance', () => {
  const screen = render(createElement(TermsUpdate));
  toTheTerms(screen);
  fireEvent.click(screen.getByRole('button', { name: 'finishAction' }));
  expect(screen.getByText('errorSummary')).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});

test('accepting records the version, the language shown and her signature', async () => {
  const screen = render(createElement(TermsUpdate));
  toTheTerms(screen);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Accepto els termes nous' }));
  fireEvent.click(screen.getByRole('button', { name: 'I cannot draw' }));
  fireEvent.click(screen.getByRole('button', { name: 'finishAction' }));
  await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
  expect(rpc).toHaveBeenCalledTimes(1);
  const [name, args] = rpc.mock.calls[0]!;
  expect(name).toBe('accept_current_app_terms');
  expect(args).toEqual({
    p_version_id: VERSION_ID,
    // Her language is English; this version is Catalan only.
    p_locale_shown: 'ca',
    p_signing: expect.objectContaining({
      terms_accepted: true,
      media_consent: true,
      unable_to_draw: true,
      signature: null,
    }),
  });
});

test('terms built as a form are accepted with her ticks and signatures by block (RAPP-772)', async () => {
  const FORM_ID = '5eed0000-0000-4000-8772-000000000002';
  const SIGN_ID = '5eed0000-0000-4000-8772-000000000005';
  const SIGNATURE_ID = '5eed0000-0000-4000-8772-000000000007';
  const ACCEPT_ID = '5eed0000-0000-4000-8772-000000000008';
  const formRow = { surface: 'custom_form', custom_form_id: FORM_ID };
  queryState = {
    ...loaded,
    data: {
      catalog: withAppTermsForm(
        parseIntakeCatalog({
          screens: [],
          overrides: [],
          presets: [],
          consents: [
            {
              id: ACCEPT_ID,
              key: 'app_terms',
              system_key: 'app_terms',
              name: text('Condicions'),
              body: text('He llegit i accepto les condicions'),
              is_archived: false,
            },
          ],
          consent_placements: [],
          blocks: [],
          terms: { ...terms, form_id: FORM_ID },
          custom_forms: [
            {
              id: FORM_ID,
              name: text('Condicions'),
              filled_by: 'player',
              mandatory: 'required_to_use_app',
              deadline: null,
              kind: 'legal',
              system_key: 'app_terms',
              version: 2,
              published_at: null,
              is_archived: false,
              screens: [
                {
                  id: SIGN_ID,
                  title: text('Condicions noves'),
                  intro: null,
                  sort_order: 0,
                  system_screen: 'terms_sign',
                  texts: {
                    decline_label: {
                      ca: 'Més tard',
                      es: 'Més tard',
                      en: 'Més tard',
                      ar: 'Més tard',
                      fa: 'Més tard',
                    },
                  },
                },
              ],
            },
          ],
          custom_form_blocks: [
            {
              ...formRow,
              id: SIGNATURE_ID,
              screen_key: SIGN_ID,
              kind: 'signature',
              body: text('Signo.'),
              sort_order: 1,
            },
          ],
          custom_form_consent_placements: [
            {
              ...formRow,
              id: ACCEPT_ID,
              consent_id: ACCEPT_ID,
              screen_key: SIGN_ID,
              sort_order: 0,
              required: true,
            },
          ],
        }),
      ),
      answers: {},
      mediaConsent: false,
    },
  };
  const screen = render(createElement(TermsUpdate));
  expect(screen.getByRole('heading', { name: 'Condicions noves' })).toBeTruthy();
  // The screen's own decline label.
  expect(screen.getByRole('button', { name: 'Més tard' })).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'He llegit i accepto les condicions' }));
  fireEvent.click(screen.getByRole('button', { name: 'I cannot draw' }));
  fireEvent.click(screen.getByRole('button', { name: 'finishAction' }));
  await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
  expect(rpc.mock.calls[0]).toEqual([
    'accept_current_app_terms',
    {
      p_version_id: VERSION_ID,
      // Her app language: each text records the language it was shown in.
      p_locale_shown: 'en',
      p_signing: {
        answers: {},
        consents: { app_terms: true },
        signatures: { [SIGNATURE_ID]: { unable_to_draw: true, language: 'ca' } },
        device: 'android 35',
      },
    },
  ]);
});

test('Not now asks first, then signs her out', () => {
  const screen = render(createElement(TermsUpdate));
  toTheTerms(screen);
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  expect(alert).toHaveBeenCalledTimes(1);
  alert.mock.calls[0]?.[2]?.[1]?.onPress?.();
  expect(logout).toHaveBeenCalledTimes(1);
  expect(rpc).not.toHaveBeenCalled();
});

test('when the terms cannot be read, she can retry or leave, and nothing can be accepted', () => {
  queryState = {
    data: undefined,
    isError: true,
    isFetching: false,
    refetch,
    error: new Error('connection reset'),
  };
  const screen = render(createElement(TermsUpdate));
  // Never a spinner forever, and never a text she could accept unread.
  expect(screen.getByRole('heading', { name: 'termsTitle' })).toBeTruthy();
  expect(screen.queryByText('termsBody')).toBeNull();
  expect(screen.getByText('termsUpdateLoadFailed')).toBeTruthy();
  // Accepting needs the version, so the fallback offers no acceptance.
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'errors:retry' }));
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(rpc).not.toHaveBeenCalled();
  // And she can still sign out.
  fireEvent.click(screen.getByRole('button', { name: 'termsDeclineAction' }));
  alert.mock.calls[0]?.[2]?.[1]?.onPress?.();
  expect(logout).toHaveBeenCalledTimes(1);
});

test('terms this build cannot read fail closed: she retries, never accepts (RAPP-772)', () => {
  queryState = {
    ...loaded,
    data: {
      catalog: parseIntakeCatalog({
        screens: [],
        overrides: [],
        presets: [],
        terms: { id: VERSION_ID, version_number: 3, content: { title: 'unknown shape' } },
      }),
      answers: {},
      mediaConsent: false,
    },
  };
  const screen = render(createElement(TermsUpdate));
  expect(screen.getByText('termsUpdateLoadFailed')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

test('while the first read is still running, she sees the loader', () => {
  queryState = { data: undefined, isError: false, isFetching: true, refetch };
  const screen = render(createElement(TermsUpdate));
  expect(screen.getByText('loading')).toBeTruthy();
});
