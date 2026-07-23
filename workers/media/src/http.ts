/**
 * HTTP shaping for the media Worker. Two rules live here:
 *
 *   1. A failure response carries a stable error CODE, never a message. The
 *      apps translate `errors:<code>` into the user's language (RAPP-11/12); a
 *      string invented by a Worker would reach a player in English and dodge
 *      the translation gate entirely.
 *   2. CORS is an explicit origin allowlist. The admin runs in a browser, so
 *      the mint endpoint is cross-origin by construction; a wildcard would let
 *      any site spend a signed-in user's upload quota.
 */

import type { AppErrorCode } from '@ramassa/shared/errors';

const statusByErrorCode: Partial<Record<AppErrorCode, number>> = {
  'AUTH-2': 401,
  'AUTH-3': 403,
  'UPLOAD-2': 400,
  'UPLOAD-3': 400,
  'UPLOAD-4': 429,
  'UPLOAD-5': 403,
  'VALIDATION-1': 400,
};

export function getStatusForErrorCode(code: AppErrorCode): number {
  return statusByErrorCode[code] ?? 500;
}

export interface ErrorResponseBody {
  readonly error: { readonly code: AppErrorCode };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...init.headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(code: AppErrorCode, headers: HeadersInit = {}): Response {
  const body: ErrorResponseBody = { error: { code } };
  return jsonResponse(body, { status: getStatusForErrorCode(code), headers });
}

export function parseAllowedOrigins(allowedOrigins: string): readonly string[] {
  return allowedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Echoes the request origin only when it is allowlisted. Native apps send no
 * Origin header and need no CORS headers at all, so the absence of one is not
 * an error.
 */
export function buildCorsHeaders(
  request: Request,
  allowedOrigins: readonly string[],
): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (origin === null || !allowedOrigins.includes(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
