/**
 * Admin auth wiring (RAPP-13): email-code and password actions used by staff
 * and entity users. Successful code verification also accepts a pending entity
 * invitation before the role gate chooses a landing page.
 */

import {
  requestEmailOtp as sharedRequestEmailOtp,
  signInWithPassword as sharedSignInWithPassword,
  signOut as sharedSignOut,
  verifyEmailOtp as sharedVerifyEmailOtp,
} from '@ramassa/shared/auth';
import { acceptPendingEntityInvitation } from '@ramassa/shared/entity-management';
import type { AppError, Result } from '@ramassa/shared/errors';
import { logger, safeAsync } from './observability';
import { supabase } from './supabase';

export function sendEmailOtp(email: string): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedRequestEmailOtp(supabase, { email }));
}

export function confirmEmailOtp(email: string, token: string): Promise<Result<void, AppError>> {
  return safeAsync(
    async () => {
      await sharedVerifyEmailOtp(supabase, { email, token });
      await acceptPendingEntityInvitation(supabase);
    },
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
  return safeAsync(() => sharedSignOut(supabase));
}

/** Reports a role-lookup failure from the AuthProvider to the wired logger/Sentry. */
export function reportAuthError(error: AppError): void {
  logger.error(error.message, { error, code: error.code });
}
