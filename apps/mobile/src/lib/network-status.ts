import { onlineManager } from '@tanstack/react-query';

export interface NetworkStateLike {
  readonly isConnected?: boolean;
  readonly isInternetReachable?: boolean;
}

interface NetworkStatusContext {
  readonly isDev: boolean;
  readonly backendUrl: string;
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

/**
 * React Query's browser reconnect listener does not exist on native. Expo
 * Network supplies the device listener, and onlineManager pauses radio work
 * while cached rows remain readable.
 */
export function configureNetworkStatus(context?: NetworkStatusContext): void {
  onlineManager.setEventListener((setOnline) => {
    // USB port forwarding and simulator loopback do not use the device radio.
    // Let local requests run; normal request errors still handle a stopped server.
    if (isLoopbackDevelopmentBackend(context)) {
      setOnline(true);
      return;
    }
    let disposed = false;
    let subscription: { remove(): void } | undefined;

    void import('expo-network')
      .then(async (Network) => {
        const initial = await Network.getNetworkStateAsync();
        if (disposed) return;
        setOnline(isNetworkStateOnline(initial));
        subscription = Network.addNetworkStateListener((state) => {
          setOnline(isNetworkStateOnline(state));
        });
      })
      .catch(() => {
        // A network probe must never keep the app from booting. React Query's
        // default online state remains in place, and normal request errors still
        // surface through the feature's translated stale-data and retry states.
      });

    return () => {
      disposed = true;
      subscription?.remove();
    };
  });
}
