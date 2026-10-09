import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const back = mock(() => undefined);
const replace = mock(() => undefined);
const setErrorCode = mock(() => undefined);
let canGoBack = true;
mock.module('expo-router', () => ({
  useRouter: () => ({ back, replace, canGoBack: () => canGoBack }),
}));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('@/lib/auth-flow-status', () => ({
  useAuthFlowStatus: () => ({ errorCode: null, setErrorCode }),
}));
mock.module('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/components/auth/auth-form-error', () => ({ AuthFormError: () => null }));
mock.module('@/components/motion/shake-on-error', () => ({
  ShakeOnError: ({ children }: { children: ReactNode }) => children,
}));
mock.module('@/components/auth/auth-screen', () => ({
  AuthScreen: ({
    title,
    onBack,
    children,
  }: {
    title: string;
    onBack: () => void;
    children: ReactNode;
  }) =>
    createElement(
      'main',
      null,
      createElement('h1', null, title),
      createElement('button', { onClick: onBack }, 'Back'),
      children,
    ),
}));
mock.module('@/components/auth/email-otp-form', () => ({
  EmailOtpRequestForm: ({
    onSent,
    renderLayout,
  }: {
    onSent: (email: string) => void;
    renderLayout: (fields: ReactNode, action: ReactNode) => ReactNode;
  }) =>
    renderLayout(
      createElement('button', { onClick: () => onSent('player@example.test') }, 'Send code'),
      null,
    ),
  EmailOtpVerifyForm: ({
    email,
    renderLayout,
  }: {
    email: string;
    renderLayout: (fields: ReactNode, action: ReactNode) => ReactNode;
  }) => renderLayout(createElement('p', null, email), null),
}));
const { default: Screen } = await import('../../app/(auth)/email-login');
beforeEach(() => {
  back.mockClear();
  replace.mockClear();
  setErrorCode.mockClear();
  canGoBack = true;
});
afterAll(() => mock.restore());

test('email Back returns through the existing language-screen history', () => {
  const view = render(createElement(Screen));
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(back).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
  view.unmount();
});

test('direct email entry without history returns to language selection', () => {
  canGoBack = false;
  const view = render(createElement(Screen));
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(replace).toHaveBeenCalledWith('/(auth)');
  expect(back).not.toHaveBeenCalled();
  view.unmount();
});

test('OTP Back returns to email entry and clears errors without leaving login', () => {
  const view = render(createElement(Screen));
  fireEvent.click(view.getByRole('button', { name: 'Send code' }));
  expect(view.getByRole('heading').textContent).toBe('emailOtpSentTitle');
  expect(view.getByText('player@example.test')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(view.getByRole('heading').textContent).toBe('emailLoginTitle');
  expect(setErrorCode).toHaveBeenCalledWith(null);
  expect(back).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  view.unmount();
});
