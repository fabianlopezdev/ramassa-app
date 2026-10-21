/**
 * Mobile auth wiring (RAPP-13): email OTP for player login and password actions for
 * developer test accounts. Authentication never travels through a custom-scheme URL.
 */

import {
  requestEmailOtp as sharedRequestEmailOtp,
  signInWithPassword as sharedSignInWithPassword,
  signOut as sharedSignOut,
  verifyEmailCode,
} from '@ramassa/shared/auth';
import { isTestSignInBuild } from '@ramassa/shared/env';
import type { AppError, Result } from '@ramassa/shared/errors';
import { logger, safeAsync } from './observability';
import { leavePreview } from './player-preview';
import { removePushToken } from './push-notifications';
import { mobileClientEnv, previewMode, supabase } from './supabase';

/**
 * A staging build (RAPP-616): the code step also accepts the fixed code of a
 * test account, and the email step offers "I already have a code".
 */
export const testSignInBuild = isTestSignInBuild(mobileClientEnv);

/** Reports a role-lookup failure from the AuthProvider to the wired logger/Sentry. */
export function reportAuthError(error: AppError): void {
  logger.error(error.message, { error, code: error.code });
}

export function sendEmailOtp(email: string): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedRequestEmailOtp(supabase, { email }));
}

export function confirmEmailOtp(email: string, token: string): Promise<Result<void, AppError>> {
  return safeAsync(
    () => verifyEmailCode(supabase, { email, token }, { testSignIn: testSignInBuild }),
    { code: 'AUTH-4' },
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

export function logout(): Promise<Result<void, AppError>> {
  return safeAsync(async () => {
    // In the player preview, signing out leaves the preview; her own session
    // and her device's push token stay (RAPP-371).
    if (previewMode.isActive()) {
      await leavePreview();
      return;
    }
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
