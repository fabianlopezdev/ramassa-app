/**
 * Mobile auth wiring (RAPP-13): email-code and password actions used by the
 * login screen. Authentication never travels through a custom-scheme URL.
 */

import {
  requestEmailOtp as sharedRequestEmailOtp,
  signInWithAccessCode as sharedSignInWithAccessCode,
  signInWithPassword as sharedSignInWithPassword,
  signOut as sharedSignOut,
  verifyEmailOtp as sharedVerifyEmailOtp,
} from '@ramassa/shared/auth';
import type { AppError, Result } from '@ramassa/shared/errors';
import { logger, safeAsync } from './observability';
import { removePushToken } from './push-notifications';
import { supabase } from './supabase';

/** Reports a role-lookup failure from the AuthProvider to the wired logger/Sentry. */
export function reportAuthError(error: AppError): void {
  logger.error(error.message, { error, code: error.code });
}

export function sendEmailOtp(email: string): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedRequestEmailOtp(supabase, { email }));
}

export function confirmEmailOtp(email: string, token: string): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedVerifyEmailOtp(supabase, { email, token }), { code: 'AUTH-4' });
}

export function loginWithPassword(
  email: string,
  password: string,
): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedSignInWithPassword(supabase, { email, password }), {
    code: 'AUTH-6',
  });
}

export function loginWithAccessCode(accessCode: string): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedSignInWithAccessCode(supabase, { accessCode }), {
    code: 'AUTH-6',
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
