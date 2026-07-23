/**
 * Push-token registration side effects (RAPP-17): the thin layer that talks to
 * expo-notifications and Supabase. Every decision it makes lives in the pure
 * `push-registration` module, so this file stays a wiring shim.
 *
 * Registration only. SENDING notifications (targeting, templates,
 * auto-translation) is Phase 3/8 and is deliberately absent.
 *
 * Nothing here throws at the caller: push is optional (SPEC UX hard constraint)
 * and a device that cannot register must still run the app normally, so every
 * path returns a decision/outcome and routes real failures through safeAsync.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getOrCreateDeviceId } from './device-id';
import { logger, safeAsync } from './observability';
import {
  buildPushTokenRow,
  decidePushRegistration,
  resolvePushPlatform,
  shouldWriteToken,
  type PushPermissionStatus,
  type PushRegistrationDecision,
} from './push-registration';
import { mmkvStorage } from './storage';
import { supabase } from './supabase';

const LAST_WRITTEN_TOKEN_KEY = 'ramassa.pushToken.lastWritten';

/**
 * The EAS projectId `getExpoPushTokenAsync` needs (SDK 49+). Absent until the
 * project is linked with `eas init`, which is why the pure decision treats it as
 * a first-class skip reason rather than letting the call throw.
 */
export function getEasProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // Set by EAS Build/Update at runtime; the classic manifest path.
    Constants.easConfig?.projectId
  );
}

function toPermissionStatus(status: Notifications.PermissionStatus): PushPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/** Current OS permission, without prompting. */
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return toPermissionStatus(status);
}

/**
 * Triggers the real OS prompt. Call ONLY after the translated rationale has been
 * shown and accepted (SPEC UX hard constraint: never a bare system dialog first).
 */
export async function requestPushPermission(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync();
  return toPermissionStatus(status);
}

/**
 * Android requires an explicit channel or notifications arrive silently with
 * minimum importance. Android is the primary platform here (SPEC), so this runs
 * before any token work. No-op elsewhere.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** What the app should do about push right now, given live device state. */
export async function resolvePushRegistrationDecision(
  hasSession: boolean,
): Promise<PushRegistrationDecision> {
  return decidePushRegistration({
    hasSession,
    os: Platform.OS,
    hasProjectId: Boolean(getEasProjectId()),
    permission: await getPushPermissionStatus(),
  });
}

/**
 * Fetches the Expo token and upserts it for this user + device. Safe to call on
 * every app start: it skips the network write when nothing rotated, and the
 * (user_id, device_id) conflict target means a rotated token updates the row in
 * place instead of leaving an undeliverable duplicate behind.
 */
export async function registerPushToken(userId: string): Promise<void> {
  const platform = resolvePushPlatform(Platform.OS);
  const projectId = getEasProjectId();
  if (platform === null || !projectId) return;

  await ensureAndroidChannel();

  const result = await safeAsync(
    async () => {
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      const deviceId = getOrCreateDeviceId(mmkvStorage);
      const lastWritten = mmkvStorage.getString(LAST_WRITTEN_TOKEN_KEY) ?? null;

      if (!shouldWriteToken(lastWritten, token)) return;

      const { error } = await supabase
        .from('push_tokens')
        .upsert(buildPushTokenRow({ userId, token, platform, deviceId }), {
          onConflict: 'user_id,device_id',
        });
      if (error) throw error;

      mmkvStorage.set(LAST_WRITTEN_TOKEN_KEY, token);
    },
    { code: 'NETWORK-1', context: { operation: 'registerPushToken' } },
  );

  if (!result.ok) {
    // Already logged and reported by safeAsync. Swallowed on purpose: failing to
    // register push must never block a signed-in player from using the app.
    logger.info('push token registration skipped after failure');
  }
}

/**
 * Withdraws this device's token on sign-out, so the next person to sign in on
 * this device does not inherit the previous user's notifications. Deletes by
 * device, not by token: the stored token may already have rotated.
 */
export async function removePushToken(userId: string): Promise<void> {
  const deviceId = getOrCreateDeviceId(mmkvStorage);
  await safeAsync(
    async () => {
      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', deviceId);
      if (error) throw error;
      mmkvStorage.remove(LAST_WRITTEN_TOKEN_KEY);
    },
    { code: 'NETWORK-1', context: { operation: 'removePushToken' } },
  );
}
