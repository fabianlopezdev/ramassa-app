/**
 * The app lock (RAPP-236): an optional lock for every account, kept on this
 * device. When it is on, the app asks for Face ID, a fingerprint or the device
 * passcode after it has been in the background for the chosen time, and at
 * every cold start. It is on by default for team members, because their screens
 * show other people's data; anyone can turn it off.
 *
 * The lock protects a phone that is already unlocked and left on a table. It
 * does not replace the session: the database checks every read and write.
 */
import type { AccountArea } from './account-area';

/** How long the app may stay in the background before it locks, in seconds. */
export const APP_LOCK_TIMEOUTS = [0, 60, 300, 900] as const;
export type AppLockTimeout = (typeof APP_LOCK_TIMEOUTS)[number];

export interface AppLockSettings {
  readonly enabled: boolean;
  readonly timeoutSeconds: AppLockTimeout;
}

export interface AppLockStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

const APP_LOCK_PREFIX = 'ramassa.app-lock.v1';
const DEFAULT_TIMEOUT: AppLockTimeout = 60;

const settingsKey = (userId: string) => `${APP_LOCK_PREFIX}:${userId}`;

/** On for team members until they choose otherwise; off for everyone else. */
export function defaultAppLockSettings(area: AccountArea): AppLockSettings {
  return { enabled: area === 'team', timeoutSeconds: DEFAULT_TIMEOUT };
}

function isTimeout(value: unknown): value is AppLockTimeout {
  return APP_LOCK_TIMEOUTS.some((timeout) => timeout === value);
}

export function readAppLockSettings(
  storage: AppLockStorage,
  userId: string,
  area: AccountArea,
): AppLockSettings {
  const fallback = defaultAppLockSettings(area);
  const raw = storage.getString(settingsKey(userId));
  if (raw === undefined) return fallback;
  try {
    const parsed = JSON.parse(raw) as { enabled?: unknown; timeoutSeconds?: unknown };
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : fallback.enabled,
      timeoutSeconds: isTimeout(parsed.timeoutSeconds)
        ? parsed.timeoutSeconds
        : fallback.timeoutSeconds,
    };
  } catch {
    return fallback;
  }
}

export function writeAppLockSettings(
  storage: AppLockStorage,
  userId: string,
  settings: AppLockSettings,
): void {
  storage.set(settingsKey(userId), JSON.stringify(settings));
}

/** Whether coming back to the front locks the app. */
export function shouldLockOnReturn(input: {
  readonly settings: AppLockSettings;
  readonly backgroundedAtMs: number | null;
  readonly nowMs: number;
}): boolean {
  if (!input.settings.enabled || input.backgroundedAtMs === null) return false;
  return input.nowMs - input.backgroundedAtMs >= input.settings.timeoutSeconds * 1000;
}

/**
 * While signed authorizations wait on this tablet to sync (RAPP-305), they hold
 * health data and signatures. The lock is then on whatever the setting says,
 * and locks after a minute at most.
 */
export function effectiveAppLockSettings(
  settings: AppLockSettings,
  pendingSignings: number,
): AppLockSettings {
  if (pendingSignings === 0) return settings;
  return {
    enabled: true,
    timeoutSeconds: settings.enabled
      ? (Math.min(settings.timeoutSeconds, DEFAULT_TIMEOUT) as AppLockTimeout)
      : DEFAULT_TIMEOUT,
  };
}
