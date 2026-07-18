/**
 * Admin auth wiring (RAPP-13): the magic-link redirect target and the actions
 * the login form + callback route call, each through the admin's wired
 * `safeAsync`. Magic links come back to `/auth/callback` on this origin, and
 * that same URL is the only prefix the callback parser trusts (open-redirect
 * guard). Staff and entity users authenticate the same way; only the landing
 * differs by role.
 */

import {
  completeAuthCallback as sharedCompleteAuthCallback,
  requestMagicLink as sharedRequestMagicLink,
  signInWithPassword as sharedSignInWithPassword,
  signOut as sharedSignOut,
} from '@ramassa/shared/auth';
import type { AppError, Result } from '@ramassa/shared/errors';
import type { AppRole } from '@ramassa/shared/schemas';
import { logger, safeAsync } from './observability';
import { supabase } from './supabase';

const AUTH_CALLBACK_PATH = '/auth/callback';

/** The callback URL on THIS origin (browser-only; login runs client-side). */
function authRedirectTo(): string {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

/** Where each role lands after authenticating (staff/admin CMS vs entity portal). */
export function roleLandingPath(role: AppRole | null): '/dashboard' | '/portal' {
  return role === 'entity' ? '/portal' : '/dashboard';
}

export function sendMagicLink(email: string): Promise<Result<void, AppError>> {
  return safeAsync(() =>
    sharedRequestMagicLink(supabase, { email, emailRedirectTo: authRedirectTo() }),
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
  return safeAsync(
    () =>
      sharedCompleteAuthCallback(supabase, url, { allowedRedirectPrefixes: [authRedirectTo()] }),
    { code: 'AUTH-4' },
  );
}

export function logout(): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedSignOut(supabase));
}

/** Reports a role-lookup failure from the AuthProvider to the wired logger/Sentry. */
export function reportAuthError(error: AppError): void {
  logger.error(error.message, { error, code: error.code });
}
