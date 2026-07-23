/**
 * Mobile auth wiring (RAPP-13): the magic-link redirect target and the actions
 * screens call. `Linking.createURL` builds the right deep link for the current
 * runtime (a `ramassa://auth/callback` custom-scheme link in a dev/production
 * build), and the SAME value is the only prefix the callback parser trusts, so
 * a link crafted to point anywhere else is rejected before `setSession`.
 */

import * as Linking from 'expo-linking';
import {
  completeAuthCallback as sharedCompleteAuthCallback,
  requestMagicLink as sharedRequestMagicLink,
  signInWithPassword as sharedSignInWithPassword,
  signOut as sharedSignOut,
} from '@ramassa/shared/auth';
import type { AppError, Result } from '@ramassa/shared/errors';
import { logger, safeAsync } from './observability';
import { removePushToken } from './push-notifications';
import { supabase } from './supabase';

/** Reports a role-lookup failure from the AuthProvider to the wired logger/Sentry. */
export function reportAuthError(error: AppError): void {
  logger.error(error.message, { error, code: error.code });
}

/** Where Supabase sends the magic link back to (deep link into this app). */
export const authRedirectTo = Linking.createURL('auth/callback');

/** The only redirect origins the callback parser will accept (open-redirect guard). */
const allowedRedirectPrefixes = [authRedirectTo];

/** True for a deep link that is our auth callback (vs any other app deep link). */
export function isAuthCallbackUrl(url: string): boolean {
  return url.startsWith(authRedirectTo);
}

export function sendMagicLink(email: string): Promise<Result<void, AppError>> {
  return safeAsync(() =>
    sharedRequestMagicLink(supabase, { email, emailRedirectTo: authRedirectTo }),
  );
}

export function loginWithPassword(
  email: string,
  password: string,
): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedSignInWithPassword(supabase, { email, password }), {
    code: 'AUTH-6',
  });
}

export function completeMagicLink(url: string): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedCompleteAuthCallback(supabase, url, { allowedRedirectPrefixes }), {
    code: 'AUTH-4',
  });
}

export function logout(): Promise<Result<void, AppError>> {
  return safeAsync(async () => {
    // Withdraw this device's push token BEFORE the session ends (RAPP-17). The
    // delete is RLS-scoped to auth.uid(), so it is impossible once signed out,
    // and skipping it would leave the next person to sign in on this device
    // inheriting the previous user's notifications.
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await removePushToken(data.user.id);
    }
    await sharedSignOut(supabase);
  });
}
