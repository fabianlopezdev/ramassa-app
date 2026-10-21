/**
 * Auth actions (RAPP-13): thin, platform-neutral wrappers over supabase-js that
 * both apps call. Each takes the app's Supabase client (dependency injection,
 * like the client factory) and throws a typed `AppError` on failure, so the
 * caller's wired `safeAsync` logs it and turns it into a `Result`. Nothing
 * here reaches for a logger or Sentry directly.
 *
 * ADR-005: `requestEmailOtp` is the primary path; `signInWithPassword` serves
 * the web admin login and the mobile developer test accounts. `shouldCreateUser: false` keeps login closed to
 * already-provisioned accounts (invite-only distribution, RAPP-1).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import { appRoleSchema, type AppRole } from '../schemas/auth';
import type { Database } from '../types/database';
import { mapEmailOtpRequestError, mapSupabaseAuthError } from './auth-error';

type Client = SupabaseClient<Database>;

export interface RequestEmailOtpParams {
  readonly email: string;
}

export async function requestEmailOtp(
  client: Client,
  params: RequestEmailOtpParams,
): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: params.email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    throw new AppError(mapEmailOtpRequestError(error), {
      message: error.message,
      context: { status: error.status, authCode: error.code },
    });
  }
}

export interface VerifyEmailOtpParams {
  readonly email: string;
  readonly token: string;
}

export async function verifyEmailOtp(client: Client, params: VerifyEmailOtpParams): Promise<void> {
  const { error } = await client.auth.verifyOtp({
    email: params.email,
    token: params.token,
    type: 'email',
  });
  if (error) {
    throw new AppError(mapSupabaseAuthError(error, 'AUTH-4'), {
      message: error.message,
      context: { status: error.status, authCode: error.code },
    });
  }
}

/**
 * The sign-in code step, with the staging fixed code for test accounts
 * (RAPP-616). The emailed code is always tried first. Only in a build with
 * `EXPO_PUBLIC_TEST_SIGN_IN=true`, and only when that code is refused, the
 * staging `test-sign-in` function is asked: for a test account and the fixed
 * code it returns a token hash, which becomes a session through `verifyOtp`
 * (https://supabase.com/docs/reference/javascript/auth-verifyotp, `token_hash`
 * with type `email`). Any other outcome is the normal refusal, so a real
 * account on staging sees exactly what it sees anywhere else.
 */
export async function verifyEmailCode(
  client: Client,
  params: VerifyEmailOtpParams,
  options: { readonly testSignIn: boolean },
): Promise<void> {
  try {
    await verifyEmailOtp(client, params);
    return;
  } catch (refused) {
    if (!options.testSignIn) throw refused;
    const exchanged = await tryTestSignIn(client, params);
    if (!exchanged) throw refused;
  }
}

async function tryTestSignIn(client: Client, params: VerifyEmailOtpParams): Promise<boolean> {
  try {
    const { data, error } = await client.functions.invoke<{ token_hash?: unknown }>(
      'test-sign-in',
      { body: { email: params.email, code: params.token } },
    );
    const tokenHash = data?.token_hash;
    if (error || typeof tokenHash !== 'string' || tokenHash === '') return false;
    const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    return verified.error === null;
  } catch {
    return false;
  }
}

export interface PasswordLoginParams {
  readonly email: string;
  readonly password: string;
}

export async function signInWithPassword(
  client: Client,
  params: PasswordLoginParams,
): Promise<void> {
  const { error } = await client.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error) {
    // A bare failure on the password path almost always means bad credentials.
    throw new AppError(mapSupabaseAuthError(error, 'AUTH-6'), {
      message: error.message,
      context: { status: error.status, authCode: error.code },
    });
  }
}

export async function signOut(client: Client): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    throw new AppError('AUTH-1', { message: error.message });
  }
}

/**
 * Reads the signed-in identity's role from its profile row. The role gates the
 * UI (player / staff / admin / entity), so an unexpected value fails loudly
 * instead of silently defaulting to the wrong surface.
 */
export async function fetchProfileRole(client: Client, userId: string): Promise<AppRole> {
  const { data, error } = await client.from('profiles').select('role').eq('id', userId).single();
  if (error) {
    throw new AppError('DB-1', { message: error.message, context: { userId } });
  }
  const role = appRoleSchema.safeParse(data?.role);
  if (!role.success) {
    throw new AppError('AUTH-1', { context: { userId, reason: 'unknown_role' } });
  }
  return role.data;
}

export interface ProfileSummary {
  readonly role: AppRole;
  readonly termsAcceptedAt: string | null;
}

/**
 * The signed-in identity's profile, or NULL when no profile row exists yet.
 *
 * The null case is the whole reason this exists alongside fetchProfileRole: a
 * brand-new player has a session but no profile until the onboarding wizard
 * completes. That is an EXPECTED state the gate routes on, so it returns null.
 * `.single()` cannot express it (a missing row is an error to PostgREST), so
 * this uses `.maybeSingle()` and reserves throwing for real failures - where
 * the gate must NOT send the player to the wizard, because "we could not read
 * the profile" is not evidence there is no profile.
 */
export async function fetchProfileSummary(
  client: Client,
  userId: string,
): Promise<ProfileSummary | null> {
  const { data, error } = await client
    .from('profiles')
    .select('role, terms_accepted_at, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw new AppError('DB-1', { message: error.message, context: { userId } });
  }
  if (data === null) {
    return null;
  }
  if (!data.is_active) {
    throw new AppError('AUTH-1', { context: { userId, reason: 'inactive_profile' } });
  }
  const role = appRoleSchema.safeParse(data.role);
  if (!role.success) {
    throw new AppError('AUTH-1', { context: { userId, reason: 'unknown_role' } });
  }
  return { role: role.data, termsAcceptedAt: data.terms_accepted_at };
}
