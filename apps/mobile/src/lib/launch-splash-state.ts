/**
 * Whether the launch splash (RAPP-955) has left the screen. A React Native
 * `Modal` draws above every view, the splash included, so anything that opens
 * one at start-up, such as the notifications question, waits for this first.
 *
 * The web build has no launch splash, so there it is done from the start.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

let done = Platform.OS === 'web';
const listeners = new Set<() => void>();

export function markLaunchSplashDone(): void {
  if (done) return;
  done = true;
  for (const listener of listeners) listener();
}

export function isLaunchSplashDone(): boolean {
  return done;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once the launch splash has faded out, and always on the web. */
export function useLaunchSplashDone(): boolean {
  return useSyncExternalStore(subscribe, isLaunchSplashDone, isLaunchSplashDone);
}
