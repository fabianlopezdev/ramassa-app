import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const sendEmailOtp = mock(async (_email: string) => {
  void _email;
  return { ok: true };
});
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => undefined }));
mock.module('@/lib/auth', () => ({
  sendEmailOtp,
  confirmEmailOtp: async () => ({ ok: true }),
  testSignInBuild: true,
}));
mock.module('@/lib/auth-flow-status', () => ({
  useAuthFlowStatus: () => ({ setErrorCode: () => undefined }),
}));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('./auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
  }) =>
    createElement('input', {
      'aria-label': label,
      value,
      onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
    }),
}));
mock.module('./auth-submit-button', () => ({
  AuthSubmitButton: ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement('button', { onClick: onPress }, label),
}));
mock.module('./existing-code-link', () => ({
  ExistingCodeLink: ({ onPress }: { onPress: () => void }) =>
    createElement('button', { onClick: onPress }, 'emailOtpExistingCodeAction'),
}));
const { EmailOtpRequestForm } = await import('./email-otp-form');
afterAll(() => mock.restore());
const renderLayout = (fields: ReactNode, action: ReactNode) =>
  createElement('main', null, fields, action);

test('a staging build goes to the code step without sending an email (RAPP-616)', async () => {
  const sent = mock(() => undefined);
  const view = render(createElement(EmailOtpRequestForm, { onSent: sent, renderLayout }));
  fireEvent.input(view.getByRole('textbox'), { target: { value: 'Jugadora.Prova@example.test' } });
  fireEvent.click(view.getByRole('button', { name: 'emailOtpExistingCodeAction' }));
  await waitFor(() => expect(sent).toHaveBeenCalledWith('jugadora.prova@example.test'));
  expect(sendEmailOtp).not.toHaveBeenCalled();
});
