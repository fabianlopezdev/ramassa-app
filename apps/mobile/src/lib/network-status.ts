import { onlineManager } from '@tanstack/react-query';

export interface NetworkStateLike {
  readonly isConnected?: boolean;
  readonly isInternetReachable?: boolean;
}

interface NetworkStatusContext {
  readonly isDev: boolean;
  readonly backendUrl: string;
}

interface Subscription {
  remove(): void;
}

/** What the online manager reads from the phone: Expo Network and the app's foreground state. */
export interface DeviceNetwork {
  readonly getNetworkStateAsync: () => Promise<NetworkStateLike>;
  readonly addNetworkStateListener: (listener: (state: NetworkStateLike) => void) => Subscription;
  readonly addForegroundListener: (listener: () => void) => Subscription;
}

/** A query the screen is waiting on, as React Query reports it. */
interface WaitingQuery {
  readonly data: unknown;
  readonly fetchStatus: 'fetching' | 'paused' | 'idle';
}

function isLoopbackDevelopmentBackend(context?: NetworkStatusContext): boolean {
  if (context?.isDev !== true) return false;
  try {
    const url = new URL(context.backendUrl);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isNetworkStateOnline(
  state: NetworkStateLike,
  context?: NetworkStatusContext,
): boolean {
  return (
    isLoopbackDevelopmentBackend(context) ||
    (state.isConnected !== false && state.isInternetReachable !== false)
  );
}

/** Whether a screen has nothing to show because a query waits for the network (RAPP-775). */
export function isWaitingForNetwork(queries: readonly WaitingQuery[]): boolean {
  return queries.some((query) => query.data === undefined && query.fetchStatus === 'paused');
}

async function loadDeviceNetwork(): Promise<DeviceNetwork> {
  const [Network, { AppState }] = await Promise.all([
    import('expo-network'),
    import('react-native'),
  ]);
  return {
    getNetworkStateAsync: () => Network.getNetworkStateAsync(),
    addNetworkStateListener: (listener) => Network.addNetworkStateListener(listener),
    addForegroundListener: (listener) =>
      AppState.addEventListener('change', (state) => {
        if (state === 'active') listener();
      }),
  };
}

let recheckActiveWatch: (() => Promise<void>) | null = null;

/**
 * Reads the phone's network again and tells React Query (RAPP-775). A paused
 * query starts the moment the phone reads as online.
 */
export async function recheckNetworkStatus(): Promise<void> {
  await recheckActiveWatch?.();
}

/**
 * Try again on a screen that waits for its data: reads the network again
 * first, because a paused query only starts once React Query knows the phone
 * is online, and a refetch alone keeps waiting (RAPP-775).
 */
export async function retryAfterNetworkCheck(refetch: () => Promise<unknown>): Promise<void> {
  await recheckNetworkStatus();
  await refetch();
}

/**
 * Keeps React Query's online state in step with the phone (RAPP-775).
 *
 * Android only reports changes. An app blocked from the network in the
 * background reads as offline, and gets no event when it comes back, so the
 * state is read again each time the app returns to the foreground and when
 * she presses Try again. The listener is added before the first read, so a
 * change between the two is never lost; a change event newer than a read wins.
 */
export function watchDeviceNetwork(
  setOnline: (online: boolean) => void,
  loadNetwork: () => Promise<DeviceNetwork> = loadDeviceNetwork,
): () => void {
  let disposed = false;
  let changeEvents = 0;
  let network: DeviceNetwork | null = null;
  const subscriptions: Subscription[] = [];

  async function readNetwork(): Promise<void> {
    if (disposed || network === null) return;
    const changeEventsBeforeRead = changeEvents;
    try {
      const state = await network.getNetworkStateAsync();
      if (disposed || changeEvents !== changeEventsBeforeRead) return;
      setOnline(isNetworkStateOnline(state));
    } catch {
      // A failed read keeps the last known state.
    }
  }

  const started = loadNetwork()
    .then((loaded) => {
      if (disposed) return;
      network = loaded;
      subscriptions.push(
        loaded.addNetworkStateListener((state) => {
          changeEvents += 1;
          setOnline(isNetworkStateOnline(state));
        }),
        loaded.addForegroundListener(() => void readNetwork()),
      );
      return readNetwork();
    })
    .catch(() => {
      // A network probe must never keep the app from booting. React Query's
      // default online state remains in place, and normal request errors still
      // surface through the feature's translated stale-data and retry states.
    });

  const recheck = async (): Promise<void> => {
    await started;
    await readNetwork();
  };
  recheckActiveWatch = recheck;

  return () => {
    disposed = true;
    if (recheckActiveWatch === recheck) recheckActiveWatch = null;
    for (const subscription of subscriptions) subscription.remove();
  };
}

/**
 * React Query's browser reconnect listener does not exist on native. Expo
 * Network supplies the device listener, and onlineManager pauses radio work
 * while cached rows remain readable.
 */
export function configureNetworkStatus(
  context?: NetworkStatusContext,
  loadNetwork?: () => Promise<DeviceNetwork>,
): void {
  onlineManager.setEventListener((setOnline) => {
    // USB port forwarding and simulator loopback do not use the device radio.
    // Let local requests run; normal request errors still handle a stopped server.
    if (isLoopbackDevelopmentBackend(context)) {
      setOnline(true);
      return;
    }
    return watchDeviceNetwork(setOnline, loadNetwork);
  });
}
