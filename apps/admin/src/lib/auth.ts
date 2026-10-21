/**
 * Admin auth wiring (RAPP-13): email-code and password actions used by staff
 * and entity users. Successful code verification also accepts a pending entity
 * invitation before the role gate chooses a landing page.
 */

import {
  requestEmailOtp as sharedRequestEmailOtp,
  signInWithPassword as sharedSignInWithPassword,
  signOut as sharedSignOut,
  verifyEmailCode,
} from '@ramassa/shared/auth';
import { acceptPendingEntityInvitation } from '@ramassa/shared/entity-management';
import { isTestSignInBuild } from '@ramassa/shared/env';
import type { AppError, Result } from '@ramassa/shared/errors';
import { logger, safeAsync } from './observability';
import { adminClientEnv, supabase } from './supabase';

// A staging build (RAPP-616): a refused code is also tried as the fixed code
// of a test account.
const testSignInBuild = isTestSignInBuild(adminClientEnv);

export function sendEmailOtp(email: string): Promise<Result<void, AppError>> {
  return safeAsync(() => sharedRequestEmailOtp(supabase, { email }));
}

export function confirmEmailOtp(email: string, token: string): Promise<Result<void, AppError>> {
  return safeAsync(
    async () => {
      await verifyEmailCode(supabase, { email, token }, { testSignIn: testSignInBuild });
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
