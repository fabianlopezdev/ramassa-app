/**
 * The app's Supabase client (RAPP-13), created once at module scope so
 * auth is ready before the first render. Session persistence rides on the MMKV
 * adapter, so a signed-in player stays signed in across cold starts (ADR-005).
 *
 * Env is read through literal `process.env.EXPO_PUBLIC_*` member accesses so
 * Metro can inline the values at bundle time (a dynamic `process.env` lookup
 * is not inlined in Expo), then validated by the shared schema — a missing key
 * fails fast with a named error instead of a confusing runtime crash later.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { parseClientEnv } from '@ramassa/shared/env';
import { createMmkvSessionStorage, createSupabaseClient } from '@ramassa/shared/supabase';
import { resolveDevServiceUrl } from './dev-service-url';
import { createPreviewModeStore, endPreviewForSignIn } from './preview-mode';
import { authStorage, previewAuthStorage, privateStorage } from './storage';

const devServiceContext = {
  isDev: __DEV__,
  platform: Platform.OS,
  hostUri: Constants.expoConfig?.hostUri,
};

export const mobileClientEnv = parseClientEnv({
  EXPO_PUBLIC_SUPABASE_URL: resolveDevServiceUrl(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    devServiceContext,
  ),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_MEDIA_WORKER_URL: resolveDevServiceUrl(
    process.env.EXPO_PUBLIC_MEDIA_WORKER_URL,
    devServiceContext,
  ),
  // Machine translation drafts for the team's content editors (RAPP-341).
  EXPO_PUBLIC_TRANSLATION_WORKER_URL: resolveDevServiceUrl(
    process.env.EXPO_PUBLIC_TRANSLATION_WORKER_URL,
    devServiceContext,
  ),
  // The only origin the web build accepts a player preview from (RAPP-372).
  EXPO_PUBLIC_ADMIN_WEB_URL: process.env.EXPO_PUBLIC_ADMIN_WEB_URL,
  // Staging builds only: the fixed code of test accounts (RAPP-616).
  EXPO_PUBLIC_TEST_SIGN_IN: process.env.EXPO_PUBLIC_TEST_SIGN_IN,
});

/**
 * The signed-in person's own client. Its session key is fixed (RAPP-420), so a
 * start against another Metro, whose host renames the Supabase URL, reads the
 * same session. Signing in a person ends any player preview left on the phone,
 * so no other session of this app is left to come back.
 */
export const ownSupabase = createSupabaseClient({
  supabaseUrl: mobileClientEnv.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: mobileClientEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: createMmkvSessionStorage(authStorage, {
    sessionKey: 'sb-ramassa-auth-token',
    onPersonChange: () =>
      void endPreviewForSignIn(previewMode, () => previewSupabase.auth.signOut({ scope: 'local' })),
  }),
});

/**
 * The player preview (RAPP-371, ADR-027): a team member sees the player app as
 * the organization's preview account, on this second client, so her own
 * session is untouched. The database makes every request of it read-only.
 */
export const previewSupabase = createSupabaseClient({
  supabaseUrl: mobileClientEnv.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: mobileClientEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: createMmkvSessionStorage(previewAuthStorage, { sessionKey: 'ramassa-player-preview' }),
});

export const previewMode = createPreviewModeStore(privateStorage);

type AppSupabaseClient = typeof ownSupabase;

/**
 * The client the screens use: the preview client while the preview shows,
 * otherwise her own. Every data module imports this one, so the player screens
 * need no change to read as the preview account.
 */
export const supabase: AppSupabaseClient = new Proxy(ownSupabase, {
  get(_target, property) {
    const client = previewMode.isActive() ? previewSupabase : ownSupabase;
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === 'function'
      ? (value as (...args: never[]) => unknown).bind(client)
      : value;
  },
});
