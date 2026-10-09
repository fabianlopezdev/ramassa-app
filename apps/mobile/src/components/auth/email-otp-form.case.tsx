import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const sendEmailOtp = mock(async (_email: string) => {
  void _email;
  return { ok: true };
});
const confirmEmailOtp = mock(async (_email: string, _code: string) => {
  void _email;
  void _code;
  return { ok: true };
});
const setErrorCode = mock(() => undefined);
const playHaptic = mock((_feedback: string) => {
  void _feedback;
});
mock.module('@/lib/haptics/haptics', () => ({ playHaptic }));
mock.module('@/lib/auth', () => ({ sendEmailOtp, confirmEmailOtp }));
mock.module('@/lib/auth-flow-status', () => ({ useAuthFlowStatus: () => ({ setErrorCode }) }));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('./auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
    errorMessage,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    errorMessage?: string;
  }) =>
    createElement(
      'div',
      null,
      createElement('input', {
        'aria-label': label,
        value,
        onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
      }),
      errorMessage,
    ),
}));
mock.module('./auth-submit-button', () => ({
  AuthSubmitButton: ({
    label,
    onPress,
    isLoading,
  }: {
    label: string;
    onPress: () => void;
    isLoading: boolean;
  }) => createElement('button', { onClick: onPress, disabled: isLoading }, label),
}));
const { EmailOtpRequestForm, EmailOtpVerifyForm } = await import('./email-otp-form');
afterAll(() => mock.restore());
const renderLayout = (fields: ReactNode, action: ReactNode) =>
  createElement(
    'main',
    null,
    createElement('section', { 'data-testid': 'fields' }, fields),
    createElement('footer', null, action),
  );

test('separated email footer keeps validation and successful request callback', async () => {
  const sent = mock(() => undefined);
  const view = render(createElement(EmailOtpRequestForm, { onSent: sent, renderLayout }));
  const action = view.getByRole('button', { name: 'emailOtpAction' });
  expect(action.closest('footer')).toBeTruthy();
  expect(view.getByTestId('fields').contains(action)).toBe(false);
  fireEvent.click(action);
  await waitFor(() => expect(view.getByText('emailInvalid')).toBeTruthy());
  expect(sendEmailOtp).not.toHaveBeenCalled();
  expect(playHaptic).toHaveBeenLastCalledWith('warning');
  fireEvent.input(view.getByRole('textbox'), { target: { value: 'player@example.com' } });
  fireEvent.click(action);
  await waitFor(() => expect(sent).toHaveBeenCalledWith('player@example.com'));
  expect(sendEmailOtp).toHaveBeenCalledWith('player@example.com');
  expect(playHaptic).toHaveBeenLastCalledWith('success');
  view.unmount();
});

test('verification footer validates and submits the same email and six digit code', async () => {
  const view = render(
    createElement(EmailOtpVerifyForm, { email: 'player@example.com', renderLayout }),
  );
  const action = view.getByRole('button', { name: 'emailOtpVerifyAction' });
  expect(action.closest('footer')).toBeTruthy();
  fireEvent.input(view.getByRole('textbox'), { target: { value: '12' } });
  fireEvent.click(action);
  await waitFor(() => expect(view.getByText('emailOtpCodeInvalid')).toBeTruthy());
  expect(confirmEmailOtp).not.toHaveBeenCalled();
  expect(playHaptic).toHaveBeenLastCalledWith('warning');
  fireEvent.input(view.getByRole('textbox'), { target: { value: '123456' } });
  fireEvent.click(action);
  await waitFor(() => expect(confirmEmailOtp).toHaveBeenCalledWith('player@example.com', '123456'));
  await waitFor(() => expect(playHaptic).toHaveBeenLastCalledWith('success'));
});
