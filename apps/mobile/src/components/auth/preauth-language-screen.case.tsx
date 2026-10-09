import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '@ramassa/shared/i18n';

const push = mock(() => undefined);
const restart = mock(async () => undefined);
const storage = new Map<string, unknown>();
mock.module('expo-router', () => ({ useRouter: () => ({ push }) }));
mock.module('expo', () => ({ reloadAppAsync: restart }));
mock.module('@/lib/storage', () => ({
  preferencesStorage: {
    set: (key: string, value: unknown) => storage.set(key, value),
    getBoolean: (key: string) => storage.get(key),
    remove: (key: string) => storage.delete(key),
  },
}));
mock.module('@/lib/i18n', () => ({ hasPersistedLanguageChoice: () => false }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => 'font-sans' }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/components/branding/public-organization-logo', () => ({
  PublicOrganizationLogo: () => createElement('img', { alt: 'Organization logo' }),
}));
const box = ({ children, testID }: { children: ReactNode; testID?: string }) =>
  createElement('div', { 'data-testid': testID }, children);
let scrollLayout: ((event: { nativeEvent: { layout: { height: number } } }) => void) | undefined;
let scrollContentSize: ((width: number, height: number) => void) | undefined;
mock.module('react-native', () => ({
  View: box,
  Text: box,
  ActivityIndicator: () => null,
  ScrollView: (
    props: Parameters<typeof box>[0] & {
      onLayout?: typeof scrollLayout;
      onContentSizeChange?: typeof scrollContentSize;
    },
  ) => {
    scrollLayout = props.onLayout;
    scrollContentSize = props.onContentSizeChange;
    return box(props);
  },
  I18nManager: { isRTL: false },
  Platform: { OS: 'ios' },
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
mock.module('react-native-safe-area-context', () => ({
  SafeAreaView: box,
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
mock.module('expo-blur', () => ({
  BlurView: () => createElement('div', { 'data-testid': 'footer-blur' }),
  BlurTargetView: box,
}));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    accessibilityLabel,
    isDisabled,
    testID,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
    isDisabled?: boolean;
    testID?: string;
  }) =>
    createElement(
      'button',
      {
        onClick: onPress,
        'aria-label': accessibilityLabel,
        disabled: isDisabled,
        'data-testid': testID,
      },
      children,
    ),
}));
mock.module('@/components/motion/pressable-depth', () => ({
  PressableDepth: ({
    children,
    onPress,
    accessibilityLabel,
    testID,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
    testID?: string;
  }) =>
    createElement(
      'button',
      { onClick: onPress, 'aria-label': accessibilityLabel, 'data-testid': testID },
      children,
    ),
}));
mock.module('@/components/motion/drawn-checkmark', () => ({ DrawnCheckmark: () => null }));
mock.module('@/components/error-fallback', () => ({ ErrorFallback: () => null }));
mock.module('expo-router/stack', () => ({ Stack: () => null }));
mock.module('@/components/motion/fade-slide-in', () => ({
  FadeSlideIn: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/components/motion/selection-transition', () => ({
  SelectionTransition: ({ children, active }: { children?: ReactNode; active: boolean }) =>
    createElement('div', { 'aria-hidden': !active }, children),
}));
const { default: Screen } = await import('../../app/(auth)/index');
const { default: AuthLayout } = await import('../../app/(auth)/_layout');
beforeEach(() => {
  push.mockClear();
  restart.mockClear();
  storage.clear();
});
afterAll(() => mock.restore());
async function screen() {
  const i18n = createI18n({
    deviceLanguages: ['en'],
    languageStorage: { getLanguage: () => null, setLanguage: () => undefined },
  });
  await i18n.changeLanguage('en');
  return { view: render(createElement(I18nextProvider, { i18n }, createElement(Screen))), i18n };
}
test('first install has Continue and language taps preview without navigating', async () => {
  const { view, i18n } = await screen();
  expect(view.getByRole('button', { name: i18n.t('auth:continueAction') })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'Español' }));
  await waitFor(() => expect(i18n.resolvedLanguage).toBe('es'));
  expect(view.getByText(i18n.t('auth:languageTitle'))).toBeTruthy();
  expect(push).not.toHaveBeenCalled();
  expect(restart).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: i18n.t('auth:continueAction') }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/email-login'));
});
test('Arabic previews in place and reloads only when confirmed', async () => {
  const { view, i18n } = await screen();
  fireEvent.click(view.getByRole('button', { name: 'العربية' }));
  await waitFor(() => expect(i18n.resolvedLanguage).toBe('ar'));
  expect(push).not.toHaveBeenCalled();
  expect(restart).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: i18n.t('auth:continueAction') }));
  await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
  expect(storage.get('auth.language-confirmed-reload')).toBe(true);
});
test('screen removes duplicate name and instructions, and keeps footer outside scroll content', async () => {
  const { view, i18n } = await screen();
  expect(view.queryByText(i18n.t('auth:languageSubtitle'))).toBeNull();
  expect(view.queryByText(i18n.t('common:appName'))).toBeNull();
  const footer = view.getByTestId('language-continue-footer');
  expect(footer.contains(view.getByRole('button', { name: i18n.t('auth:continueAction') }))).toBe(
    true,
  );
  expect(view.getByTestId('language-scroll-content').contains(footer)).toBe(false);
});

test('direction reload pushes email login so Back can return to language selection', async () => {
  storage.set('auth.language-confirmed-reload', true);
  render(createElement(AuthLayout));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/email-login'));
  expect(storage.has('auth.language-confirmed-reload')).toBe(false);
});

test('footer is clear when content fits and adds blur only for overflowing content', async () => {
  const { view } = await screen();
  expect(view.queryByTestId('footer-blur')).toBeNull();
  act(() => {
    scrollLayout!({ nativeEvent: { layout: { height: 900 } } });
    scrollContentSize!(400, 900);
  });
  expect(view.queryByTestId('footer-blur')).toBeNull();
  act(() => scrollContentSize!(400, 1040));
  expect(view.getByTestId('footer-blur')).toBeTruthy();
  // A larger viewport or smaller accessibility text must remove the tint again.
  act(() => scrollLayout!({ nativeEvent: { layout: { height: 1100 } } }));
  expect(view.queryByTestId('footer-blur')).toBeNull();
});
