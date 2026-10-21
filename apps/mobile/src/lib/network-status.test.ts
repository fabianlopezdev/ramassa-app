import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, test } from 'bun:test';
import { configureNetworkStatus, isNetworkStateOnline } from './network-status';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));

test('only an explicit disconnected or unreachable state is offline', () => {
  expect(isNetworkStateOnline({})).toBe(true);
  expect(isNetworkStateOnline({ isConnected: true, isInternetReachable: undefined })).toBe(true);
  expect(isNetworkStateOnline({ isConnected: false, isInternetReachable: true })).toBe(false);
  expect(isNetworkStateOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
});

test('native network subscription starts after the root has mounted', async () => {
  const queryClient = await readFile(`${mobileRoot}lib/query-client.ts`, 'utf8');
  const rootLayout = await readFile(`${mobileRoot}app/_layout.tsx`, 'utf8');

  expect(queryClient).not.toContain('configureNetworkStatus();');
  expect(rootLayout).toContain('useEffect(() => {\n    configureNetworkStatus({');
  expect(rootLayout).toContain('isDev: __DEV__');
  expect(rootLayout).toContain('backendUrl: mobileClientEnv.EXPO_PUBLIC_SUPABASE_URL');
});

test('an offline radio does not pause a USB loopback development backend', () => {
  const radioOffline = { isConnected: false, isInternetReachable: false };
  for (const backendUrl of [
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    'http://[::1]:54321',
  ]) {
    expect(isNetworkStateOnline(radioOffline, { isDev: true, backendUrl })).toBe(true);
    expect(isNetworkStateOnline(radioOffline, { isDev: false, backendUrl })).toBe(false);
  }
  for (const backendUrl of [
    'https://project.supabase.co',
    'http://192.168.0.30:54321',
    'http://localhost.evil.test',
    'invalid',
  ]) {
    expect(isNetworkStateOnline(radioOffline, { isDev: true, backendUrl })).toBe(false);
  }
});

test('a paused onboarding query starts over USB without another login', async () => {
  onlineManager.setOnline(false);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.mount();
  let calls = 0;
  const observer = new QueryObserver(client, {
    queryKey: ['onboarding-intake', 'test-player'],
    queryFn: async () => {
      calls += 1;
      return { ready: true };
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    expect(observer.getCurrentResult().fetchStatus).toBe('paused');
    expect(calls).toBe(0);
    configureNetworkStatus({ isDev: true, backendUrl: 'http://localhost:54321' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(observer.getCurrentResult().status).toBe('success');
    expect(observer.getCurrentResult().data).toEqual({ ready: true });
    expect(calls).toBe(1);
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    onlineManager.setEventListener(() => () => {});
    onlineManager.setOnline(true);
  }
});
