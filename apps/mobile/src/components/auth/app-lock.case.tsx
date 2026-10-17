import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

type Listener = (state: string) => void;
let appStateListeners: Listener[] = [];
const box = ({ children, testID }: { children?: ReactNode; testID?: string }) =>
  createElement('div', { 'data-testid': testID }, children);
mock.module('react-native', () => ({
  View: box,
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
  Platform: { OS: 'ios' },
  StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {} },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: Listener) => {
      appStateListeners.push(listener);
      return {
        remove: () => {
          appStateListeners = appStateListeners.filter((candidate) => candidate !== listener);
        },
      };
    },
  },
}));
mock.module('react-native-safe-area-context', () => ({ SafeAreaView: box }));
mock.module('@/components/layout/content-width', () => ({ PageWidth: box }));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
const t = (key: string) => key;
mock.module('react-i18next', () => ({ useTranslation: () => ({ t }) }));
const logout = mock(async () => undefined);
mock.module('@/lib/auth', () => ({ logout }));
// The sign-out asks first when signings wait (RAPP-305); here none wait.
mock.module('@/lib/sign-out-guard', () => ({ useGuardedLogout: () => () => void logout() }));
let pendingSignings = 0;
mock.module('@/lib/tablet-signing', () => ({ usePendingSigningCount: () => pendingSignings }));

const stored = new Map<string, string>();
mock.module('@/lib/storage', () => ({
  privateStorage: {
    getString: (key: string) => stored.get(key),
    set: (key: string, value: string) => void stored.set(key, value),
  },
}));

let enrolledLevel = 3;
let authenticates = true;
const authenticateAsync = mock(async () => ({ success: authenticates }));
mock.module('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: async () => enrolledLevel,
  authenticateAsync,
}));

let auth: { user: { id: string } | null; isLoading: boolean } = {
  user: { id: 'staff-1' },
  isLoading: false,
};
let area = 'team';
mock.module('@ramassa/shared/auth', () => ({ useAuth: () => auth }));
mock.module('@/lib/use-account-access', () => ({ useAccountAccess: () => ({ area }) }));

const { AppLockProvider } = await import('./app-lock');
const { markPreviewHandover } = await import('@/lib/preview-handover');

function app() {
  return createElement(AppLockProvider, null, createElement('p', null, 'private screen'));
}

/** Lets the device check and the Face ID answer, both promises, land. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function sendAppState(state: string) {
  act(() => {
    for (const listener of appStateListeners) listener(state);
  });
}

beforeEach(() => {
  stored.clear();
  appStateListeners = [];
  enrolledLevel = 3;
  authenticates = true;
  authenticateAsync.mockClear();
  auth = { user: { id: 'staff-1' }, isLoading: false };
  area = 'team';
  pendingSignings = 0;
});
afterAll(() => mock.restore());

test('a team member at a cold start sees the lock, which asks for Face ID and opens', async () => {
  authenticates = false;
  const view = render(app());
  // The device check resolves after a few promise turns; the suite runs beside
  // lint and typecheck in the commit hook, so the wait allows for a busy machine.
  await waitFor(() => expect(authenticateAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
  expect(view.queryByText('appLockLockedTitle')).not.toBeNull();

  authenticates = true;
  fireEvent.click(view.getByRole('button', { name: 'appLockUnlockAction' }));
  await waitFor(() => expect(view.queryByText('appLockLockedTitle')).toBeNull());
  view.unmount();
}, 15_000);

test('leaving the player preview mounts it again without a lock (RAPP-371)', async () => {
  markPreviewHandover();
  const view = render(app());
  await settle();
  expect(view.queryByText('appLockLockedTitle')).toBeNull();
  expect(authenticateAsync).not.toHaveBeenCalled();
  view.unmount();
});

test('signing in just now opens the app without a lock', async () => {
  auth = { user: null, isLoading: false };
  const view = render(app());
  auth = { user: { id: 'staff-1' }, isLoading: false };
  view.rerender(app());
  await act(async () => undefined);
  expect(view.queryByText('appLockLockedTitle')).toBeNull();
  expect(authenticateAsync).not.toHaveBeenCalled();
  view.unmount();
});

test('it locks again after the chosen time in the background, and covers the app meanwhile', async () => {
  stored.set('ramassa.app-lock.v1:staff-1', JSON.stringify({ enabled: true, timeoutSeconds: 0 }));
  const view = render(app());
  await settle();
  expect(view.queryByText('appLockLockedTitle')).toBeNull();

  sendAppState('background');
  // The app switcher snapshot shows the cover, never the screen.
  expect(view.queryByText('appLockLockedTitle')).not.toBeNull();
  authenticates = false;
  sendAppState('active');
  await waitFor(() => expect(authenticateAsync).toHaveBeenCalledTimes(2));
  expect(view.queryByText('appLockLockedTitle')).not.toBeNull();
  view.unmount();
});

test('a short trip to the background inside the chosen time stays open', async () => {
  stored.set('ramassa.app-lock.v1:staff-1', JSON.stringify({ enabled: true, timeoutSeconds: 900 }));
  const view = render(app());
  await settle();
  expect(view.queryByText('appLockLockedTitle')).toBeNull();
  sendAppState('background');
  sendAppState('active');
  await settle();
  expect(view.queryByText('appLockLockedTitle')).toBeNull();
  expect(authenticateAsync).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('a phone without a passcode never locks', async () => {
  enrolledLevel = 0;
  const view = render(app());
  await waitFor(() => expect(view.queryByText('appLockLockedTitle')).toBeNull());
  expect(authenticateAsync).not.toHaveBeenCalled();
  view.unmount();
});

test('a player starts with the lock off', async () => {
  area = 'player';
  const view = render(app());
  await act(async () => undefined);
  expect(view.queryByText('appLockLockedTitle')).toBeNull();
  expect(authenticateAsync).not.toHaveBeenCalled();
  view.unmount();
});

test('sign-out stays available on the lock screen', async () => {
  authenticates = false;
  const view = render(app());
  await waitFor(() => expect(authenticateAsync).toHaveBeenCalled());
  fireEvent.click(view.getByRole('button', { name: 'signOutAction' }));
  expect(logout).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('a coach who turned the lock off is locked while signings wait on the tablet (RAPP-305)', async () => {
  stored.set('ramassa.app-lock.v1:staff-1', JSON.stringify({ enabled: false, timeoutSeconds: 0 }));
  authenticates = false;
  const off = render(app());
  await settle();
  expect(off.queryByText('appLockLockedTitle')).toBeNull();
  off.unmount();

  pendingSignings = 2;
  const waiting = render(app());
  await waitFor(() => expect(authenticateAsync).toHaveBeenCalled());
  expect(waiting.queryByText('appLockLockedTitle')).not.toBeNull();
  waiting.unmount();
});
