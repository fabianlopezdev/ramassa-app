/**
 * The app's single Supabase client (RAPP-13), created once at module scope so
 * auth is ready before the first render. Session persistence rides on the MMKV
 * adapter, so a signed-in player stays signed in across cold starts (ADR-005).
 *
 * Env is read through literal `process.env.EXPO_PUBLIC_*` member accesses so
 * Metro can inline the values at bundle time (a dynamic `process.env` lookup
 * is not inlined in Expo), then validated by the shared schema — a missing key
 * fails fast with a named error instead of a confusing runtime crash later.
 */

import { parseClientEnv } from '@ramassa/shared/env';
import { createMmkvSessionStorage, createSupabaseClient } from '@ramassa/shared/supabase';
import { mmkvStorage } from './storage';

const env = parseClientEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

export const supabase = createSupabaseClient({
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: createMmkvSessionStorage(mmkvStorage),
});
