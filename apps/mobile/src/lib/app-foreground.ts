/**
 * The app coming back to the front, as a listener (RAPP-904).
 *
 * It lives in its own module so `network-status` can load it on demand.
 * Loading the whole `react-native` package on demand makes Metro read every
 * export of it, and on iOS the retired `PushNotificationIOS` export throws
 * when its native module is absent, which stopped a release build at launch.
 */
import { AppState } from 'react-native';

export function addForegroundListener(listener: () => void): { remove(): void } {
  return AppState.addEventListener('change', (state) => {
    if (state === 'active') listener();
  });
}
