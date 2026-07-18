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
}

export interface SupabaseClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storage: SupabaseSessionStorage;
}

export function createSupabaseClient(config: SupabaseClientConfig): SupabaseClient<Database> {
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: config.storage,
      persistSession: true,
      autoRefreshToken: true,
      // Mobile has no URL to inspect; the admin handles the magic-link callback
      // route explicitly, so URL session detection is off in both apps.
      detectSessionInUrl: false,
      // Implicit flow (RAPP-13): the magic link returns tokens in the URL, which
      // both apps validate and hand to `setSession` via `completeAuthCallback`.
      // This avoids the PKCE code_verifier, which would break a link opened on a
      // different device than the one that requested it.
      flowType: 'implicit',
    },
  });
}

/**
 * Web session storage backed by `localStorage`. Used by the admin app.
 */
export function createLocalStorageSessionStorage(): SupabaseSessionStorage {
  return {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
    removeItem: (key) => globalThis.localStorage.removeItem(key),
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

/**
 * Mobile session storage backed by MMKV. Used by the mobile app.
 */
export function createMmkvSessionStorage(mmkv: MmkvLike): SupabaseSessionStorage {
  return {
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
    removeItem: (key) => void mmkv.remove(key),
  };
}
