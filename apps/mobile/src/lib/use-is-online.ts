import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

const subscribeToOnlineState = (onChange: () => void) => onlineManager.subscribe(onChange);
const readOnlineState = () => onlineManager.isOnline();

/**
 * The app's one online state (RAPP-817): the same value React Query pauses
 * and resumes requests on. `watchDeviceNetwork` keeps it in step with the
 * phone and reads it again each time the app returns to the foreground
 * (RAPP-775), so it does not keep a stale "offline" after the app was in the
 * background, and a local development backend always counts as reachable.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeToOnlineState, readOnlineState, readOnlineState);
}
