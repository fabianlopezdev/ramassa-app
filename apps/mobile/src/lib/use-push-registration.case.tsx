import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { PushRegistrationDecision } from './push-registration';

let userId: string | null = 'player-1';
let preview = false;
const declined = new Set<string | null>();
const resolveDecision = mock(async (): Promise<PushRegistrationDecision> => ({
  kind: 'request-permission',
}));
const register = mock(async (id: string) => {
  void id;
});
const request = mock(async () => 'granted');
mock.module('@ramassa/shared/auth', () => ({
  useAuth: () => ({ session: userId ? {} : null, user: userId ? { id: userId } : null }),
}));
mock.module('./push-notifications', () => ({
  resolvePushRegistrationDecision: resolveDecision,
  registerPushToken: register,
  requestPushPermission: request,
}));
mock.module('./preview-mode', () => ({ usePreviewModeActive: () => preview }));
mock.module('./preview-handover', () => ({ takePreviewHandover: () => false }));
mock.module('./supabase', () => ({ previewMode: {} }));
mock.module('./push-rationale-memory', () => ({
  hasDeclinedPushRationale: (id: string | null) => declined.has(id),
  declinePushRationale: (id: string | null) => declined.add(id),
}));
const { usePushRegistration } = await import('./use-push-registration');

afterEach(cleanup);
beforeEach(() => {
  userId = 'player-1';
  preview = false;
  declined.clear();
  resolveDecision.mockReset();
  resolveDecision.mockImplementation(async () => ({ kind: 'request-permission' }));
  register.mockClear();
  request.mockClear();
});

test('onboarding never prompts; arriving at Home explains first, acceptance asks the OS', async () => {
  const { result, rerender } = renderHook(({ ready }) => usePushRegistration(ready), {
    initialProps: { ready: false },
  });
  await act(async () => {});
  expect(result.current.shouldShowRationale).toBe(false);
  act(() => result.current.acceptRationale());
  expect(request).not.toHaveBeenCalled();
  rerender({ ready: true });
  await waitFor(() => expect(result.current.shouldShowRationale).toBe(true));
  expect(request).not.toHaveBeenCalled();
  await act(async () => result.current.acceptRationale());
  expect(request).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledWith('player-1');
  expect(result.current.shouldShowRationale).toBe(false);
});

test('a late permission check cannot show a prompt after leaving Home', async () => {
  let finish!: (decision: PushRegistrationDecision) => void;
  resolveDecision.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(({ ready }) => usePushRegistration(ready), {
    initialProps: { ready: true },
  });
  rerender({ ready: false });
  await act(async () => finish({ kind: 'request-permission' }));
  expect(result.current.shouldShowRationale).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test('sign-out hides a visible rationale and cannot request OS permission', async () => {
  const { result, rerender } = renderHook(() => usePushRegistration(true));
  await waitFor(() => expect(result.current.shouldShowRationale).toBe(true));
  userId = null;
  rerender();
  act(() => result.current.acceptRationale());
  expect(result.current.shouldShowRationale).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test('not now is remembered across navigation without requesting permission', async () => {
  const { result, rerender } = renderHook(({ ready }) => usePushRegistration(ready), {
    initialProps: { ready: true },
  });
  await waitFor(() => expect(result.current.shouldShowRationale).toBe(true));
  act(() => result.current.declineRationale());
  rerender({ ready: false });
  rerender({ ready: true });
  await act(async () => {});
  expect(result.current.shouldShowRationale).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test('already granted permission registers quietly even on a deep link', async () => {
  resolveDecision.mockImplementation(async () => ({ kind: 'register' }));
  const { result } = renderHook(() => usePushRegistration(false));
  await waitFor(() => expect(register).toHaveBeenCalledWith('player-1'));
  expect(result.current.shouldShowRationale).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test('player preview neither registers nor prompts', async () => {
  preview = true;
  const { result } = renderHook(() => usePushRegistration(true));
  await act(async () => {});
  expect(result.current.shouldShowRationale).toBe(false);
  expect(resolveDecision).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
});
