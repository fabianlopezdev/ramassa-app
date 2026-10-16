/**
 * Typed Supabase client factory. Both apps create their client here so auth,
 * persistence, and typing stay identical; only the session storage adapter differs
 * by platform (MMKV on mobile, localStorage on web).
 *
 * The factory takes the storage adapter as an argument rather than importing a
 * native module, so this package stays platform-neutral: `react-native-mmkv` is a
 * mobile-only dependency and must never be pulled into the admin (web) bundle. The
 * mobile app injects an adapter built from its own MMKV instance.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export interface SupabaseSessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
  /**
   * The key the session is kept under, when the storage fixes one. Without it
   * supabase-js names the key after the Supabase host (RAPP-420).
   */
  readonly sessionKey?: string;
}

export interface SupabaseClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storage: SupabaseSessionStorage;
}

export function createSupabaseClient(config: SupabaseClientConfig): SupabaseClient<Database> {
  const { sessionKey } = config.storage;
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: config.storage,
      ...(sessionKey === undefined ? {} : { storageKey: sessionKey }),
      persistSession: true,
      autoRefreshToken: true,
      // Email OTP verification is explicit in both apps, so neither runtime
      // should infer a session from URL content.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

/**
 * Web session storage backed by `localStorage`. Used by the admin app.
 *
 * SSR-safe: during the admin's server render (Cloudflare Workers) there is no
 * `localStorage`, so reads return null (no session server-side) and writes
 * no-op. The browser then hydrates, reads the persisted session, and the auth
 * state resolves client-side — where the admin's route guards run (RAPP-13).
 */
export function createLocalStorageSessionStorage(): SupabaseSessionStorage {
  const isBrowser = () => typeof globalThis.localStorage !== 'undefined';
  return {
    getItem: (key) => (isBrowser() ? globalThis.localStorage.getItem(key) : null),
    setItem: (key, value) => {
      if (isBrowser()) {
        globalThis.localStorage.setItem(key, value);
      }
    },
    removeItem: (key) => {
      if (isBrowser()) {
        globalThis.localStorage.removeItem(key);
      }
    },
  };
}

/**
 * The subset of a `react-native-mmkv` instance the session storage adapter needs.
 * Declared structurally so this package does not depend on the native module; the
 * mobile app passes its real `new MMKV()` instance, which satisfies this shape.
 */
export interface MmkvLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
}

/** The session store also lists its keys, to find every session slot in it. */
export interface SessionMmkvLike extends MmkvLike {
  getAllKeys(): string[];
}

export interface MmkvSessionStorageOptions {
  /**
   * The one key the session lives under (RAPP-420). supabase-js's default,
   * `sb-<first label of the Supabase host>-auth-token`, follows the host, and in
   * development the host follows Metro's (`dev-service-url.ts`). So one store
   * held a session per host, and a relaunch against another Metro brought back
   * the person signed in there before. A second client in the same app needs
   * its own key (RAPP-371): clients with the same key tell each other about
   * sign-ins and sign-outs.
   */
  sessionKey: string;
  /** A session for another person was written: a sign-in. A token refresh is not one. */
  onPersonChange?: () => void;
}

const SESSION_SLOT_PATTERN = /^sb-.+-auth-token$/;
const SESSION_SLOT_COMPANIONS = ['-code-verifier', '-user'] as const;

function sessionSlotOf(key: string): string | null {
  const companion = SESSION_SLOT_COMPANIONS.find((suffix) => key.endsWith(suffix));
  const slot = companion === undefined ? key : key.slice(0, -companion.length);
  return SESSION_SLOT_PATTERN.test(slot) ? slot : null;
}

function personOf(sessionJson: string | undefined): string | null {
  if (sessionJson === undefined) return null;
  try {
    const parsed = JSON.parse(sessionJson) as { user?: { id?: unknown } } | null;
    const id = parsed?.user?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/**
 * Mobile session storage backed by MMKV. Used by the mobile app.
 *
 * The store holds one session only (RAPP-420). Writing it removes every other
 * session slot, so a sign-in leaves no older person behind to come back on a
 * later start, and a sign-out leaves nothing. A store from an older build,
 * whose slot was named after the host, keeps its session when it has exactly
 * one; with more than one nothing says which person is current, so all go and
 * the app starts signed out.
 */
export function createMmkvSessionStorage(
  mmkv: SessionMmkvLike,
  { sessionKey, onPersonChange }: MmkvSessionStorageOptions,
): SupabaseSessionStorage {
  const ownKeys = new Set([
    sessionKey,
    ...SESSION_SLOT_COMPANIONS.map((suffix) => `${sessionKey}${suffix}`),
  ]);
  const otherSlotKeys = () =>
    mmkv.getAllKeys().filter((key) => !ownKeys.has(key) && sessionSlotOf(key) !== null);
  const removeOtherSlots = () => {
    for (const key of otherSlotKeys()) mmkv.remove(key);
  };

  const adoptOlderSlot = (): string | null => {
    const slots = otherSlotKeys().filter((key) => SESSION_SLOT_PATTERN.test(key));
    const session = slots.length === 1 ? mmkv.getString(slots[0]!) : undefined;
    removeOtherSlots();
    if (session === undefined) return null;
    mmkv.set(sessionKey, session);
    return session;
  };

  return {
    sessionKey,
    getItem: (key) => {
      const value = mmkv.getString(key);
      if (value !== undefined) return value;
      return key === sessionKey ? adoptOlderSlot() : null;
    },
    setItem: (key, value) => {
      if (key !== sessionKey) {
        mmkv.set(key, value);
        return;
      }
      const previousPerson = personOf(mmkv.getString(key));
      mmkv.set(key, value);
      removeOtherSlots();
      if (personOf(value) !== previousPerson) onPersonChange?.();
    },
    removeItem: (key) => {
      mmkv.remove(key);
      if (key === sessionKey) removeOtherSlots();
    },
  };
}
