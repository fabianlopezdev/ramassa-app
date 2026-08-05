import { onlineManager } from '@tanstack/react-query';

export interface NetworkStateLike {
  readonly isConnected?: boolean;
  readonly isInternetReachable?: boolean;
}

export function isNetworkStateOnline(state: NetworkStateLike): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * React Query's browser reconnect listener does not exist on native. Expo
 * Network supplies the device listener, and onlineManager pauses radio work
 * while cached rows remain readable.
 */
export function configureNetworkStatus(): void {
  onlineManager.setEventListener((setOnline) => {
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
