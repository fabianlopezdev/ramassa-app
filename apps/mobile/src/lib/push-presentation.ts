/**
 * Presentation policy for a notification received while the app is open.
 *
 * Expo discards foreground notifications unless the app installs a handler.
 * Keep the message visible in the system banner and notification list. Expo
 * requires sound to be enabled for Android's drop-down alert to appear.
 */
export function foregroundNotificationBehavior(): {
  readonly shouldShowBanner: true;
  readonly shouldShowList: true;
  readonly shouldPlaySound: true;
  readonly shouldSetBadge: false;
} {
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  };
}
