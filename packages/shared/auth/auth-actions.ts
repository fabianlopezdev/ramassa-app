/**
 * Auth actions (RAPP-13): thin, platform-neutral wrappers over supabase-js that
 * both apps call. Each takes the app's Supabase client (dependency injection,
 * like the client factory) and throws a typed `AppError` on failure, so the
 * caller's wired `safeAsync` logs it and turns it into a `Result` — nothing
 * here reaches for a logger or Sentry directly.
 *
 * ADR-005: `requestMagicLink` is the primary path; `signInWithPassword` is the
 * admin-created fallback. `shouldCreateUser: false` keeps login closed to
 * already-provisioned accounts (invite-only distribution, RAPP-1).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import { appRoleSchema, type AppRole } from '../schemas/auth';
import type { Database } from '../types/database';
import { mapSupabaseAuthError } from './auth-error';
import { parseAuthCallbackUrl, type ParseAuthCallbackUrlOptions } from './callback-url';

type Client = SupabaseClient<Database>;

export interface RequestMagicLinkParams {
  readonly email: string;
  /** Where Supabase sends the link back to (deep link on mobile, route on web). */
  readonly emailRedirectTo: string;
}

export async function requestMagicLink(
  client: Client,
  params: RequestMagicLinkParams,
): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: params.email,
    options: { shouldCreateUser: false, emailRedirectTo: params.emailRedirectTo },
  });
  if (error) {
    throw new AppError(mapSupabaseAuthError(error), {
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

export async function signOut(client: Client): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    throw new AppError('AUTH-1', { message: error.message });
  }
}

/**
 * Opens a session from a magic-link callback URL: validates the URL's origin
 * and extracts the tokens (throws `AUTH-7`/`AUTH-4` on an untrusted or bad
 * link), then hands them to supabase-js. On success the client persists the
 * session and fires `onAuthStateChange`, which the AuthProvider is listening to.
 */
export async function completeAuthCallback(
  client: Client,
  url: string,
  options: ParseAuthCallbackUrlOptions,
): Promise<void> {
  const { accessToken, refreshToken } = parseAuthCallbackUrl(url, options);
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    throw new AppError(mapSupabaseAuthError(error, 'AUTH-4'), { message: error.message });
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
