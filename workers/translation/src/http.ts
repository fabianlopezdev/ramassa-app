import type { AppErrorCode } from '@ramassa/shared/errors';

const statusByErrorCode: Partial<Record<AppErrorCode, number>> = {
  'AUTH-2': 401,
  'AUTH-3': 403,
  'TRANSLATION-1': 502,
  'TRANSLATION-2': 502,
  'TRANSLATION-3': 429,
  'TRANSLATION-4': 409,
  'TRANSLATION-5': 503,
  'VALIDATION-1': 400,
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...init.headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(code: AppErrorCode, headers: HeadersInit = {}): Response {
  return jsonResponse({ error: { code } }, { status: statusByErrorCode[code] ?? 500, headers });
}

export function parseAllowedOrigins(value: string): readonly string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
