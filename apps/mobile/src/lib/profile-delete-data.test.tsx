import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import arProfile from '../../../../packages/shared/i18n/locales/ar/profile.json';
import caProfile from '../../../../packages/shared/i18n/locales/ca/profile.json';
import enProfile from '../../../../packages/shared/i18n/locales/en/profile.json';
import esProfile from '../../../../packages/shared/i18n/locales/es/profile.json';
import faProfile from '../../../../packages/shared/i18n/locales/fa/profile.json';

const submitDeletionRequest = mock(async () => ({ ok: true as const, value: undefined }));
const routerBack = mock(() => undefined);

mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({ label }: { readonly label: string }) => createElement('label', null, label),
}));

mock.module('@/components/error-code-line', () => ({
  FailureNotice: ({ message }: { readonly message: string }) => createElement('p', null, message),
}));

mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    accessibilityLabel,
    children,
    className,
    isBusy,
    isDisabled,
    onPress,
    testID,
  }: {
    readonly accessibilityLabel: string;
    readonly children: ReactNode;
    readonly className?: string;
    readonly isBusy?: boolean;
    readonly isDisabled?: boolean;
    readonly onPress: () => void;
    readonly testID?: string;
  }) =>
    createElement(
      'button',
      {
        'aria-label': accessibilityLabel,
        className,
        'data-testid': testID,
        disabled: Boolean(isBusy) || Boolean(isDisabled),
        onClick: onPress,
      },
      children,
    ),
}));

mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({
    children,
    continueLabel,
    intro,
    isContinueBusy,
    onContinue,
    title,
  }: {
    readonly children: ReactNode;
    readonly continueLabel: string;
    readonly intro?: string;
    readonly isContinueBusy?: boolean;
    readonly onContinue: () => void;
    readonly title: string;
  }) =>
    createElement(
      'main',
      null,
      createElement('h1', null, title),
      intro === undefined ? null : createElement('p', null, intro),
      children,
      createElement(
        'button',
        { disabled: Boolean(isContinueBusy), onClick: onContinue },
        continueLabel,
      ),
    ),
}));

mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: mock(() => undefined) }));
mock.module('@/lib/profile', () => ({ submitDeletionRequest }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('expo-router', () => ({ useRouter: () => ({ back: routerBack }) }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
mock.module('react-native', () => ({
  ActivityIndicator: () => createElement('span', { 'aria-label': 'busy' }),
  Modal: ({ children, visible }: { readonly children: ReactNode; readonly visible: boolean }) =>
    visible ? createElement('div', { role: 'dialog' }, children) : null,
  ScrollView: ({ children }: { readonly children: ReactNode }) =>
    createElement('div', null, children),
  Text: ({ children }: { readonly children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { readonly children: ReactNode }) => createElement('div', null, children),
}));
mock.module('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { readonly children: ReactNode }) =>
    createElement('div', null, children),
}));
mock.module('@ramassa/shared/auth', () => ({
  useAuth: () => ({ user: { id: 'player-1' } }),
}));
mock.module('@ramassa/shared/tokens', () => ({
  tokens: { colors: { white: '#fff' } },
}));

const { default: DeleteDataScreen } = await import('../app/(app)/profile-delete-data');

beforeEach(() => {
  submitDeletionRequest.mockClear();
  routerBack.mockClear();
});

afterAll(() => {
  mock.restore();
});

test('the first action opens confirmation without filing the request', () => {
  const view = render(createElement(DeleteDataScreen));

  fireEvent.click(view.getByRole('button', { name: 'deleteAction' }));

  expect(submitDeletionRequest).not.toHaveBeenCalled();
  expect(view.getByRole('dialog')).toBeTruthy();
  expect(view.getByText('deleteConfirmBody')).toBeTruthy();
});

test('only the destructive confirmation action files the request', async () => {
  const view = render(createElement(DeleteDataScreen));

  fireEvent.click(view.getByRole('button', { name: 'deleteAction' }));
  const confirm = view.getByRole('button', { name: 'deleteConfirmAction' });

  expect(confirm.className).toContain('bg-error');
  fireEvent.click(confirm);

  await waitFor(() => expect(submitDeletionRequest).toHaveBeenCalledTimes(1));
  expect(routerBack).toHaveBeenCalledTimes(1);
});

test('cancelling confirmation returns to the request form without filing', () => {
  const view = render(createElement(DeleteDataScreen));

  fireEvent.click(view.getByRole('button', { name: 'deleteAction' }));
  fireEvent.click(view.getByRole('button', { name: 'deleteConfirmCancel' }));

  expect(submitDeletionRequest).not.toHaveBeenCalled();
  expect(view.queryByRole('dialog')).toBeNull();
  expect(view.getByRole('button', { name: 'deleteAction' })).toBeTruthy();
});

test('all five profile catalogs carry the confirmation copy', () => {
  for (const profile of [caProfile, esProfile, enProfile, arProfile, faProfile]) {
    expect(profile.deleteConfirmTitle).toBeTruthy();
    expect(profile.deleteConfirmBody).toBeTruthy();
    expect(profile.deleteConfirmAction).toBeTruthy();
    expect(profile.deleteConfirmCancel).toBeTruthy();
  }
});
