/**
 * The pure decisions behind push-token registration (RAPP-17).
 *
 * Kept free of Expo, React and Supabase imports (the caller passes plain values)
 * so the whole matrix, especially the skip paths, is directly unit-testable
 * without a device. Same reasoning as `role-landing.ts` / `route-access.ts`.
 *
 * Registration only: obtaining and storing the token. SENDING is Phase 3/8.
 */

/** The platforms `push_tokens.platform` accepts (migration 0002). */
export type PushPlatform = 'android' | 'ios' | 'web';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type PushSkipReason =
  | 'no-session'
  | 'unsupported-platform'
  | 'not-a-physical-device'
  | 'missing-project-id'
  | 'permission-denied';

export type PushRegistrationDecision =
  | { readonly kind: 'register' }
  | { readonly kind: 'request-permission' }
  | { readonly kind: 'skip'; readonly reason: PushSkipReason };

export interface PushRegistrationInput {
  readonly hasSession: boolean;
  /** Expo cannot mint a push token on a simulator/emulator. */
  readonly isPhysicalDevice: boolean;
  /** `Platform.OS`, passed in so this module stays free of react-native. */
  readonly os: string;
  /** `getExpoPushTokenAsync` requires an EAS projectId (SDK 49+). */
  readonly hasProjectId: boolean;
  readonly permission: PushPermissionStatus;
}

/**
 * `web` is deliberately NOT a client platform yet: the column allows it for a
 * future web-push phase, but VAPID keys are not configured, so claiming a web
 * token here would store a row nothing could ever deliver to.
 */
export function resolvePushPlatform(os: string): PushPlatform | null {
  if (os === 'android' || os === 'ios') {
    return os;
  }
  return null;
}

/**
 * Order matters: the earliest genuinely disqualifying condition wins, so the
 * reported reason is the real one (a signed-out simulator reports `no-session`,
 * not `not-a-physical-device`). Every non-register outcome is a QUIET skip:
 * push is optional and the app must stay fully usable without it.
 */
export function decidePushRegistration(input: PushRegistrationInput): PushRegistrationDecision {
  const { hasSession, isPhysicalDevice, os, hasProjectId, permission } = input;

  if (!hasSession) {
    return { kind: 'skip', reason: 'no-session' };
  }
  if (resolvePushPlatform(os) === null) {
    return { kind: 'skip', reason: 'unsupported-platform' };
  }
  if (!isPhysicalDevice) {
    return { kind: 'skip', reason: 'not-a-physical-device' };
  }
  // The live path until someone runs `eas init`: degrade quietly, never throw.
  if (!hasProjectId) {
    return { kind: 'skip', reason: 'missing-project-id' };
  }
  if (permission === 'denied') {
    return { kind: 'skip', reason: 'permission-denied' };
  }
  if (permission === 'undetermined') {
    // The caller shows the translated rationale BEFORE the OS prompt (SPEC UX
    // hard constraint: never a bare system dialog first).
    return { kind: 'request-permission' };
  }
  return { kind: 'register' };
}

/**
 * Client-side dedupe. The DB already guarantees one row per (user, device) via
 * `on conflict (user_id, device_id)`, so this only avoids a pointless network
 * write on every app start when nothing rotated.
 */
export function shouldWriteToken(lastWrittenToken: string | null, fetchedToken: string): boolean {
  return lastWrittenToken !== fetchedToken;
}

export interface PushTokenRow {
  readonly user_id: string;
  readonly token: string;
  readonly platform: PushPlatform;
  readonly device_id: string;
}

/** Snake-case to match the column names the upsert targets. */
export function buildPushTokenRow(input: {
  readonly userId: string;
  readonly token: string;
  readonly platform: PushPlatform;
  readonly deviceId: string;
}): PushTokenRow {
  return {
    user_id: input.userId,
    token: input.token,
    platform: input.platform,
    device_id: input.deviceId,
  };
}
