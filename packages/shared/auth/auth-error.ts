/**
 * Maps a Supabase Auth error onto a stable `AUTH-*` code (RAPP-13), so the
 * player sees a precise translated message ("code expired", "too many
 * attempts") instead of one generic "sign-in failed". Supabase's own error
 * strings are English-only and unstable, so we never surface them; we classify
 * them here and let the i18n `errors:<code>` message do the talking.
 *
 * The input is a structural type, so callers can pass the raw `{ error }` from
 * any supabase-js auth method without importing the SDK's `AuthError` type.
 */

import type { AppErrorCode } from '../errors';

export interface SupabaseAuthErrorShape {
  readonly message?: string;
  readonly status?: number;
  readonly code?: string;
}

const RATE_LIMIT_STATUS = 429;
const rateLimitPattern = /rate limit|too many|over_email_send_rate|over_request_rate/i;
// Only a genuinely expired or invalid code. A message that merely mentions
// "otp" does not count: Supabase's send-step rejections ("Signups not allowed
// for otp") map to the fallback, because the player never got a code. The
// expired case is `otp_expired`, "Token has expired", or Supabase's own "Email
// link is invalid or has expired" wording, all caught by `expired`/`invalid`.
const expiredOrInvalidLinkPattern = /expired|invalid.*(token|link|otp)|token has expired/i;
const invalidCredentialsPattern = /invalid login credentials|invalid credentials/i;

/**
 * Classifies a Supabase auth error. `fallback` is the code used when nothing
 * more specific matches: `AUTH-1` for the email-code path, `AUTH-6` for the
 * admin password path (a bare failure there almost always means bad credentials).
 */
export function mapSupabaseAuthError(
  error: SupabaseAuthErrorShape | null | undefined,
  fallback: AppErrorCode = 'AUTH-1',
): AppErrorCode {
  if (!error) {
    return fallback;
  }

  const code = error.code ?? '';
  const message = error.message ?? '';

  if (error.status === RATE_LIMIT_STATUS || rateLimitPattern.test(code || message)) {
    return 'AUTH-5';
  }
  if (code === 'invalid_credentials' || invalidCredentialsPattern.test(message)) {
    return 'AUTH-6';
  }
  if (expiredOrInvalidLinkPattern.test(code || message)) {
    return 'AUTH-4';
  }
  return fallback;
}
