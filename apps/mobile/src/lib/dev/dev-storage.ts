/**
 * MMKV inspection and clearing for the dev menu (RAPP-19).
 *
 * Keys are DISCOVERED at runtime (`getAllKeys`) rather than listed here. The
 * modules that own them keep them private on purpose (the session key belongs
 * to supabase-js and encodes the project ref; `ramassa.deviceId` belongs to the
 * push dedupe), and exporting them just so a dev screen could name them would
 * widen a production contract for a dev-only reader. Discovery also shows keys
 * a future feature adds without anyone remembering to update this file: they
 * land in `other`, visibly.
 */

export type DevStorageGroup = 'session' | 'language' | 'device' | 'push' | 'other';

export const DEV_STORAGE_GROUPS: readonly DevStorageGroup[] = [
  'session',
  'language',
  'device',
  'push',
  'other',
];

/** The MMKV surface this module needs. Structural, so tests pass a plain fake. */
export interface DevStorageInspector {
  getAllKeys(): readonly string[];
  getString(key: string): string | undefined;
  remove(key: string): boolean;
}

/**
 * `sb-<project-ref>-auth-token` is supabase-js's own key shape; the rest are the
 * app's. An unrecognized key is `other` rather than being folded into a
 * neighbouring group, so clearing a group can never take something unexpected
 * with it.
 */
export function classifyStorageKey(key: string): DevStorageGroup {
  if (key.startsWith('sb-')) return 'session';
  if (key === 'ramassa.language') return 'language';
  if (key === 'ramassa.deviceId') return 'device';
  if (key.startsWith('ramassa.pushToken')) return 'push';
  return 'other';
}

export type GroupedStorageKeys = Record<DevStorageGroup, readonly string[]>;

/** Buckets keys by group, sorted, so the panel keeps a stable order. */
export function groupStorageKeys(keys: readonly string[]): GroupedStorageKeys {
  const grouped: Record<DevStorageGroup, string[]> = {
    session: [],
    language: [],
    device: [],
    push: [],
    other: [],
  };
  for (const key of [...keys].sort()) {
    grouped[classifyStorageKey(key)].push(key);
  }
  return grouped;
}

/** Removes the given keys and reports how many actually existed. */
export function clearStorageKeys(storage: DevStorageInspector, keys: readonly string[]): number {
  let removedCount = 0;
  for (const key of keys) {
    if (storage.remove(key)) {
      removedCount += 1;
    }
  }
  return removedCount;
}
