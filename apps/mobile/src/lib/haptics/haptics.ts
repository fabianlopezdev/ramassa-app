/**
 * The haptic vocabulary (RAPP-70): the ONE place the app touches expo-haptics.
 * Feature code calls `playHaptic('success')` or `playErrorHaptic(code)` and
 * never imports the SDK, the same seam `observability.ts` puts around Sentry.
 *
 * Every path is best-effort and silent on failure. Haptics are a finish, not a
 * feature: a cheap Android with a weak or absent vibrator, or an OS that
 * refuses the call, must degrade to nothing rather than surface an error. That
 * is also why `playHaptic` returns void and swallows rejections instead of
 * handing callers a Result to ignore.
 *
 * The kill switch is persisted in MMKV so it survives restarts, and defaults to
 * ON: absence of the key means enabled, so a fresh install feels finished.
 *
 * On "auto-disable when the system says so" (RAPP-70 scope item 3): there is no
 * public API on either platform to READ the user's haptic preference, so this
 * module cannot branch on it, and pretending otherwise would be a lie in code.
 * It does not need to: both platforms already enforce it below us. iOS ignores
 * `UIFeedbackGenerator` when System Haptics is off, and Android's vibrator
 * respects the touch-feedback setting. The requirement is therefore satisfied by
 * the platform, and the app-level switch above exists for the case the platform
 * cannot cover: hardware that technically vibrates but does it so poorly that a
 * user would rather have nothing. Verify by turning System Haptics off on a
 * physical device; a simulator has no vibrator and is silent either way.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { mmkvStorage } from '../storage';
import { hapticForErrorCode, shouldPlayHaptic, type HapticFeedback } from './haptic-policy';

const HAPTICS_ENABLED_KEY = 'ramassa.haptics.enabled';
const DISABLED_VALUE = 'false';

/** Defaults to true: only an explicit opt-out disables haptics. */
export function areHapticsEnabled(): boolean {
  return mmkvStorage.getString(HAPTICS_ENABLED_KEY) !== DISABLED_VALUE;
}

export function setHapticsEnabled(isEnabled: boolean): void {
  mmkvStorage.set(HAPTICS_ENABLED_KEY, isEnabled ? 'true' : DISABLED_VALUE);
}

function runFeedback(feedback: HapticFeedback): Promise<void> {
  switch (feedback) {
    case 'selection':
      return Haptics.selectionAsync();
    case 'tapLight':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/**
 * Fire and forget. Never awaited by a caller, never throws: a failed buzz must
 * not change what the UI does next.
 */
export function playHaptic(feedback: HapticFeedback): void {
  if (!shouldPlayHaptic({ isEnabled: areHapticsEnabled(), os: Platform.OS })) {
    return;
  }
  void runFeedback(feedback).catch(() => {
    // Deliberately silent: see the module comment.
  });
}

/**
 * The tie-in to the RAPP-12 error path, so every AppError surface can speak
 * with one voice: a fixable input problem warns, a system failure errors.
 */
export function playErrorHaptic(code: AppErrorCode): void {
  playHaptic(hapticForErrorCode(code));
}
