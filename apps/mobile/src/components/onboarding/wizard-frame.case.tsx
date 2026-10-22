import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

let params: { edit?: string } = {};
mock.module('expo-router', () => ({ useLocalSearchParams: () => params }));
mock.module('@/lib/onboarding-entrance', () => ({ useOnboardingEntrance: () => 'none' }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { current: number; total: number }) =>
      values ? `${values.current}/${values.total}` : key,
  }),
}));
mock.module('react-native', () => ({
  View: ({
    children,
    testID,
    className,
  }: {
    children?: ReactNode;
    testID?: string;
    className?: string;
  }) => createElement('div', { 'data-testid': testID, className }, children),
  Text: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement('span', { 'data-testid': testID }, children),
}));
mock.module('@/components/auth/auth-back-button', () => ({
  AuthBackButton: ({ onPress }: { onPress: () => void }) =>
    createElement('button', { onClick: onPress }, 'Back'),
}));
mock.module('@/components/auth/auth-submit-button', () => ({
  AuthSubmitButton: ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement('button', { onClick: onPress }, label),
}));
mock.module('@/components/auth/auth-title', () => ({
  AuthTitle: ({ title }: { title: string }) => createElement('h1', null, title),
}));
mock.module('@/components/layout/form-screen', () => ({
  FormScreen: ({
    children,
    navigation,
    heading,
    bottomAction,
  }: {
    children: ReactNode;
    navigation: ReactNode;
    heading: ReactNode;
    bottomAction: ReactNode;
  }) => createElement('main', null, navigation, heading, children, bottomAction),
}));
const { WizardFrame } = await import('./wizard-frame');
const { ScreenWordingProvider } = await import('@/lib/screen-wording');
const { EMPTY_INTAKE_CATALOG } = await import('@ramassa/shared/intake-builder');
afterAll(() => mock.restore());

test('edit mode omits both progress indicators while preserving actions and normal wizard progress', () => {
  const onContinue = mock(() => {});
  const onBack = mock(() => {});
  const props = {
    screenId: 'background' as const,
    stepNumber: 2,
    totalSteps: 14,
    title: 'Background',
    continueLabel: 'Continue',
    onContinue,
    onBack,
    children: createElement('input', { 'aria-label': 'Name' }),
  };
  params = {};
  const screen = render(createElement(WizardFrame, props));
  expect(screen.getByTestId('wizard-step-2').textContent).toBe('2/14');
  expect(screen.container.querySelectorAll('.h-xs')).toHaveLength(14);
  params = { edit: '1' };
  screen.rerender(createElement(WizardFrame, props));
  expect(screen.queryByTestId('wizard-step-2')).toBeNull();
  expect(screen.container.querySelectorAll('.h-xs')).toHaveLength(0);
  expect(screen.getByLabelText('Name')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
  params = {};
  screen.rerender(createElement(WizardFrame, props));
  expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
  expect(screen.container.querySelectorAll('.h-xs')).toHaveLength(14);
  screen.unmount();
});

test('staff wording of a built-in screen shows in her language; elsewhere the app text stays (RAPP-612)', () => {
  params = {};
  const catalog = {
    ...EMPTY_INTAKE_CATALOG,
    screenSettings: [
      {
        screen: 'summary' as const,
        texts: {
          title: { ar: 'راجعي بياناتك', ca: '  ' },
          help: { ar: 'يمكنكِ التغيير قبل القبول' },
          continue_label: { ar: 'كل شيء صحيح' },
        },
        isHidden: false,
      },
    ],
  };
  const frame = createElement(WizardFrame, {
    screenId: 'summary',
    stepNumber: 8,
    totalSteps: 10,
    title: 'Are these your details?',
    continueLabel: 'Confirm',
    onContinue: () => {},
    children: createElement('input', { 'aria-label': 'Row' }),
  });
  const arabic = render(
    createElement(ScreenWordingProvider, { catalog, language: 'ar', children: frame }),
  );
  expect(arabic.getByRole('heading').textContent).toBe('راجعي بياناتك');
  expect(arabic.getByText('يمكنكِ التغيير قبل القبول')).toBeTruthy();
  expect(arabic.getByRole('button', { name: 'كل شيء صحيح' })).toBeTruthy();
  arabic.unmount();

  // An empty Catalan override and a language staff never wrote fall back.
  const catalan = render(
    createElement(ScreenWordingProvider, { catalog, language: 'ca', children: frame }),
  );
  expect(catalan.getByRole('heading').textContent).toBe('Are these your details?');
  expect(catalan.getByRole('button', { name: 'Confirm' })).toBeTruthy();
  expect(catalan.queryByText('يمكنكِ التغيير قبل القبول')).toBeNull();
  catalan.unmount();

  // Outside the wizard there is no wording at all.
  const outside = render(frame);
  expect(outside.getByRole('heading').textContent).toBe('Are these your details?');
  outside.unmount();
});

test('the terms screens never take a staff title: it is the terms version', () => {
  const catalog = {
    ...EMPTY_INTAKE_CATALOG,
    screenSettings: [
      {
        screen: 'terms' as const,
        texts: { title: { ca: 'Never shown' }, continue_label: { ca: 'Acabar' } },
        isHidden: false,
      },
    ],
  };
  const screen = render(
    createElement(ScreenWordingProvider, {
      catalog,
      language: 'ca',
      children: createElement(WizardFrame, {
        screenId: 'terms',
        title: 'Termes de la versió',
        continueLabel: 'Finish',
        onContinue: () => {},
        children: null,
      }),
    }),
  );
  expect(screen.getByRole('heading').textContent).toBe('Termes de la versió');
  expect(screen.getByRole('button', { name: 'Acabar' })).toBeTruthy();
  screen.unmount();
});
