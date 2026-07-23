/**
 * The admin's single Supabase client (RAPP-13). Session persistence rides on
 * localStorage, so a signed-in staff/entity user stays signed in across reloads
 * (ADR-005). The storage adapter is SSR-safe, so this module can be imported by
 * the server render without a `localStorage` reference error; the session is
 * recovered in the browser, where the route guards run.
 *
 * Env is read through literal `import.meta.env.EXPO_PUBLIC_*` accesses (exposed
 * to the admin via `envPrefix` in vite.config.ts) so Vite statically replaces
 * them, then validated by the shared client schema — the same one the mobile
 * app uses. Server-only secrets are never referenced here.
 */

import { parseClientEnv } from '@ramassa/shared/env';
import { createLocalStorageSessionStorage, createSupabaseClient } from '@ramassa/shared/supabase';

const env = parseClientEnv({
  EXPO_PUBLIC_SUPABASE_URL: import.meta.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
});

export const supabase = createSupabaseClient({
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: createLocalStorageSessionStorage(),
});
