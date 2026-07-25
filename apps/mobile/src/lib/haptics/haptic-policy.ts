/**
 * The haptic vocabulary's decisions (RAPP-70), kept free of expo-haptics and
 * react-native so the whole matrix is unit-testable without a device, the same
 * shape as `push-registration.ts`.
 *
 * The point of a vocabulary is that a feeling means something. `warning` is
 * reserved for "you can fix this by changing what you typed" and `error` for
 * "something failed and retyping will not help". Getting that backwards trains
 * users to ignore the buzz, which is worse than no haptics at all.
 *
 * Routing is keyed off the AppError DOMAIN wherever the whole domain agrees,
 * with a small set of code-level exceptions, so a new code added to the
 * registry (which is append-only, RAPP-12) automatically gets sensible
 * feedback and a test proves none can fall through.
 */

import type { AppErrorCode } from '@ramassa/shared/errors';
import { errorCodeRegistry } from '@ramassa/shared/errors';

export const HAPTIC_FEEDBACKS = ['selection', 'tapLight', 'success', 'warning', 'error'] as const;

export type HapticFeedback = (typeof HAPTIC_FEEDBACKS)[number];

/**
 * Codes that are the user's own input rather than a system failure. These warn
 * instead of erroring: a mistyped password should not feel like a crash.
 */
const USER_CORRECTABLE_CODES: readonly AppErrorCode[] = ['AUTH-6', 'UPLOAD-2', 'UPLOAD-3'];

export function hapticForErrorCode(code: AppErrorCode): HapticFeedback {
  if (USER_CORRECTABLE_CODES.includes(code)) {
    return 'warning';
  }
  return errorCodeRegistry[code].domain === 'VALIDATION' ? 'warning' : 'error';
}

/**
 * Only iOS and Android have a haptic engine worth driving. Everything else is a
 * silent skip, never a throw: haptics are a finish, and an app that crashes on
 * a device without a vibrator has traded a nicety for an outage.
 *
 * Cheap Android hardware is weak and inconsistent, which is why the kill switch
 * exists and why it is checked first.
 */
export function shouldPlayHaptic(input: { isEnabled: boolean; os: string }): boolean {
  if (!input.isEnabled) {
    return false;
  }
  return input.os === 'ios' || input.os === 'android';
}
