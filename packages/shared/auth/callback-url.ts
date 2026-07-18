/**
 * Parses a magic-link callback URL into the tokens needed to open a session
 * (RAPP-13). Supabase uses the implicit flow, so the redirect carries the
 * tokens in the URL (in the fragment for a normal link, or an `error_*` set
 * when the link was bad). Both apps hand their incoming deep link / callback
 * URL here before touching supabase-js.
 *
 * Security (issue scope §2 — "verify deep links validate their origin, no
 * open-redirect via crafted links"): a URL that does not begin with one of the
 * caller's OWN expected redirect prefixes is rejected as untrusted (`AUTH-7`)
 * before any token is read, so a link crafted to point elsewhere never reaches
 * `setSession`.
 */

import { AppError } from '../errors';

export interface AuthCallbackTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface ParseAuthCallbackUrlOptions {
  /**
   * The redirect URLs this app itself asked Supabase to send the link to
   * (e.g. `ramassa://auth/callback` on mobile, `https://admin.../auth/callback`
   * on web). The incoming URL must start with one of them.
   */
  readonly allowedRedirectPrefixes: readonly string[];
}

/** Collects params from BOTH the query and the fragment of a callback URL. */
function collectUrlParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const segments: string[] = [];

  if (queryIndex !== -1) {
    const queryEnd = hashIndex > queryIndex ? hashIndex : url.length;
    segments.push(url.slice(queryIndex + 1, queryEnd));
  }
  if (hashIndex !== -1) {
    segments.push(url.slice(hashIndex + 1));
  }

  return new URLSearchParams(segments.join('&'));
}

export function parseAuthCallbackUrl(
  url: string,
  options: ParseAuthCallbackUrlOptions,
): AuthCallbackTokens {
  const isTrusted = options.allowedRedirectPrefixes.some((prefix) => url.startsWith(prefix));
  if (!isTrusted) {
    throw new AppError('AUTH-7', { context: { reason: 'untrusted_redirect_origin' } });
  }

  const params = collectUrlParams(url);

  // Supabase reports a bad or expired link with an `error_*` set in the URL
  // rather than tokens. `otp_expired` is the common one (link already used or
  // past its hour); anything else in that family is still an invalid link.
  const errorCode = params.get('error_code') ?? params.get('error');
  if (errorCode) {
    throw new AppError('AUTH-4', { context: { supabaseErrorCode: errorCode } });
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    throw new AppError('AUTH-4', { context: { reason: 'missing_tokens' } });
  }

  return { accessToken, refreshToken };
}
