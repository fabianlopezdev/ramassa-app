/**
 * Auth actions (RAPP-13): thin, platform-neutral wrappers over supabase-js that
 * both apps call. Each takes the app's Supabase client (dependency injection,
 * like the client factory) and throws a typed `AppError` on failure, so the
 * caller's wired `safeAsync` logs it and turns it into a `Result` — nothing
 * here reaches for a logger or Sentry directly.
 *
 * ADR-005: `requestEmailOtp` is the primary path; `signInWithPassword` is the
 * admin-created fallback. `shouldCreateUser: false` keeps login closed to
 * already-provisioned accounts (invite-only distribution, RAPP-1).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import { appRoleSchema, type AppRole } from '../schemas/auth';
import type { Database } from '../types/database';
import { internalEmailForAccessCode, splitAccessCode } from './access-code';
import { mapSupabaseAuthError } from './auth-error';

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
    throw new AppError(mapSupabaseAuthError(error), {
      message: error.message,
      context: { status: error.status },
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
      context: { status: error.status },
    });
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
      context: { status: error.status },
    });
  }
}

export interface AccessCodeLoginParams {
  readonly accessCode: string;
}

export async function signInWithAccessCode(
  client: Client,
  params: AccessCodeLoginParams,
): Promise<void> {
  const parts = splitAccessCode(params.accessCode);
  const email = internalEmailForAccessCode(params.accessCode);
  if (!parts || !email) {
    throw new AppError('AUTH-6');
  }

  const { error } = await client.auth.signInWithPassword({
    email,
    password: parts.canonical,
  });
  if (error) {
    throw new AppError(mapSupabaseAuthError(error, 'AUTH-6'), {
      message: error.message,
      context: { status: error.status },
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
 * completes, and that is an EXPECTED state the gate routes on, not an error.
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
