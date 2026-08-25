import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

type LoginResult =
  | { readonly ok: true; readonly value: undefined }
  | { readonly ok: false; readonly error: { readonly code: 'AUTH-6' } };

const loginWithAccessCode = mock(async (): Promise<LoginResult> => ({
  ok: true,
  value: undefined,
}));
const setErrorCode = mock(() => undefined);

mock.module('@/components/auth/auth-submit-button', () => ({
  AuthSubmitButton: ({
    label,
    onPress,
  }: {
    readonly label: string;
    readonly onPress: () => void;
  }) => createElement('button', { onClick: onPress }, label),
}));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    onChangeText,
    value,
  }: {
    readonly label: string;
    readonly onChangeText: (value: string) => void;
    readonly value: string;
  }) =>
    createElement('input', {
      'aria-label': label,
      onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
      value,
    }),
}));
mock.module('@/lib/auth', () => ({ loginWithAccessCode }));
mock.module('@/lib/auth-flow-status', () => ({ useAuthFlowStatus: () => ({ setErrorCode }) }));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }) => createElement('div', null, children),
}));

const { AccessCodeLoginForm } = await import('./access-code-login-form');

beforeEach(() => {
  loginWithAccessCode.mockClear();
  setErrorCode.mockClear();
});
afterAll(() => mock.restore());

test('masks pasted input and submits the canonical whole access code', async () => {
  const view = render(createElement(AccessCodeLoginForm));
  const input = view.getByRole('textbox', { name: 'accessCodeLabel' });

  fireEvent.input(input, { target: { value: 'ABCD EFGH JKMP' } });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('abcd-efgh-jkmp'));
  fireEvent.click(view.getByRole('button', { name: 'accessCodeAction' }));

  await waitFor(() => expect(loginWithAccessCode).toHaveBeenCalledWith('abcd-efgh-jkmp'));
  expect(setErrorCode).toHaveBeenCalledWith(null);
});

test('maps a rejected access code to the existing AUTH-6 recovery copy', async () => {
  loginWithAccessCode.mockResolvedValueOnce({
    ok: false as const,
    error: { code: 'AUTH-6' },
  });
  const view = render(createElement(AccessCodeLoginForm));

  fireEvent.input(view.getByRole('textbox'), { target: { value: 'abcd-efgh-jkmp' } });
  fireEvent.click(view.getByRole('button', { name: 'accessCodeAction' }));

  await waitFor(() => expect(setErrorCode).toHaveBeenLastCalledWith('AUTH-6'));
});
