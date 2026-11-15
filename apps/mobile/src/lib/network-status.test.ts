import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, test } from 'bun:test';
import {
  configureNetworkStatus,
  isNetworkStateOnline,
  isWaitingForNetwork,
  recheckNetworkStatus,
  retryAfterNetworkCheck,
  watchDeviceNetwork,
  type DeviceNetwork,
  type NetworkStateLike,
} from './network-status';

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

/** A phone whose network the test controls; Android only reports changes, so `set` alone sends no event. */
function fakePhone(initial: NetworkStateLike) {
  let state = initial;
  const networkListeners = new Set<(next: NetworkStateLike) => void>();
  const foregroundListeners = new Set<() => void>();
  const calls: string[] = [];
  let pendingRead: (() => void) | null = null;
  let holdReads = false;
  const network: DeviceNetwork = {
    getNetworkStateAsync: () => {
      calls.push('read');
      const read = state;
      if (!holdReads) return Promise.resolve(read);
      return new Promise((resolve) => {
        pendingRead = () => resolve(read);
      });
    },
    addNetworkStateListener: (listener) => {
      calls.push('listen');
      networkListeners.add(listener);
      return { remove: () => networkListeners.delete(listener) };
    },
    addForegroundListener: (listener) => {
      foregroundListeners.add(listener);
      return { remove: () => foregroundListeners.delete(listener) };
    },
  };
  return {
    load: async () => network,
    calls,
    set: (next: NetworkStateLike) => {
      state = next;
    },
    emit: (next: NetworkStateLike) => {
      state = next;
      for (const listener of networkListeners) listener(next);
    },
    foreground: () => {
      for (const listener of foregroundListeners) listener();
    },
    holdReads: () => {
      holdReads = true;
    },
    releaseRead: () => pendingRead?.(),
    listenerCount: () => networkListeners.size + foregroundListeners.size,
  };
}

const offline = { isConnected: false, isInternetReachable: false };
const online = { isConnected: true, isInternetReachable: true };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function pausedOnboardingQuery() {
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
  return {
    observer,
    calls: () => calls,
    dispose: () => {
      unsubscribe();
      client.unmount();
      client.clear();
      onlineManager.setEventListener(() => () => {});
      onlineManager.setOnline(true);
    },
  };
}

test('the change listener is added before the first read, and a change during the read wins', async () => {
  const phone = fakePhone(offline);
  phone.holdReads();
  const states: boolean[] = [];
  const stop = watchDeviceNetwork((value) => states.push(value), phone.load);
  await settle();
  expect(phone.calls).toEqual(['listen', 'read']);
  phone.emit(online);
  phone.releaseRead();
  await settle();
  expect(states).toEqual([true]);
  stop();
});

test('coming back to the app reads the network again and starts a paused query (RAPP-775)', async () => {
  const phone = fakePhone(offline);
  configureNetworkStatus(undefined, phone.load);
  await settle();
  const query = pausedOnboardingQuery();
  try {
    expect(query.observer.getCurrentResult().fetchStatus).toBe('paused');
    // Back online with no change event, as after a background network block.
    phone.set(online);
    await settle();
    expect(query.calls()).toBe(0);
    phone.foreground();
    await settle();
    expect(query.observer.getCurrentResult().status).toBe('success');
    expect(query.calls()).toBe(1);
  } finally {
    query.dispose();
  }
});

test('Try again reads the network again, where a refetch alone kept waiting (RAPP-775)', async () => {
  const phone = fakePhone(offline);
  configureNetworkStatus(undefined, phone.load);
  await settle();
  const query = pausedOnboardingQuery();
  try {
    phone.set(online);
    void query.observer.refetch();
    await settle();
    expect(query.observer.getCurrentResult().fetchStatus).toBe('paused');
    expect(query.calls()).toBe(0);
    await retryAfterNetworkCheck(() => query.observer.refetch());
    expect(query.observer.getCurrentResult().status).toBe('success');
    expect(query.observer.getCurrentResult().data).toEqual({ ready: true });
    expect(query.calls()).toBe(1);
  } finally {
    query.dispose();
  }
});

test('Try again while the phone is really offline keeps the query waiting', async () => {
  const phone = fakePhone(offline);
  configureNetworkStatus(undefined, phone.load);
  await settle();
  const query = pausedOnboardingQuery();
  try {
    void retryAfterNetworkCheck(() => query.observer.refetch());
    await settle();
    expect(query.observer.getCurrentResult().fetchStatus).toBe('paused');
    expect(query.calls()).toBe(0);
    phone.emit(online);
    await settle();
    expect(query.observer.getCurrentResult().status).toBe('success');
  } finally {
    query.dispose();
  }
});

test('stopping the watch removes its listeners and its recheck', async () => {
  const phone = fakePhone(online);
  const states: boolean[] = [];
  const stop = watchDeviceNetwork((value) => states.push(value), phone.load);
  await settle();
  expect(phone.listenerCount()).toBe(2);
  stop();
  expect(phone.listenerCount()).toBe(0);
  phone.set(offline);
  await recheckNetworkStatus();
  expect(states).toEqual([true]);
});

test('a screen waits for the network only while a query without data is paused', () => {
  expect(isWaitingForNetwork([{ data: undefined, fetchStatus: 'paused' }])).toBe(true);
  expect(isWaitingForNetwork([{ data: { cached: true }, fetchStatus: 'paused' }])).toBe(false);
  expect(
    isWaitingForNetwork([
      { data: undefined, fetchStatus: 'fetching' },
      { data: undefined, fetchStatus: 'idle' },
    ]),
  ).toBe(false);
});
