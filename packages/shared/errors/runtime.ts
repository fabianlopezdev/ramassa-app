/**
 * Runtime-compatible AppError source used by the apps and Supabase Edge Functions.
 * Keep this module self-contained so Deno can import it without a workspace bundle.
 */

export const errorDomains = [
  'AUTH',
  'DB',
  'EVENTS',
  'NETWORK',
  'PUSH',
  'SYNC',
  'UPLOAD',
  'TRANSLATION',
  'VALIDATION',
  'UNEXPECTED',
] as const;

export type ErrorDomain = (typeof errorDomains)[number];

interface ErrorCodeDefinition {
  readonly domain: ErrorDomain;
  readonly description: string;
}

function defineCodes<const Registry extends Record<string, ErrorCodeDefinition>>(
  registry: Registry,
): Registry {
  return registry;
}

/** Append-only stable error-code registry. */
export const errorCodeRegistry = defineCodes({
  'AUTH-1': { domain: 'AUTH', description: 'Sign-in failed' },
  'AUTH-2': { domain: 'AUTH', description: 'Session expired or invalid' },
  'AUTH-3': { domain: 'AUTH', description: 'Not authorized for this action' },
  'AUTH-4': { domain: 'AUTH', description: 'Magic link is invalid or has expired' },
  'AUTH-5': { domain: 'AUTH', description: 'Too many sign-in attempts (rate limited)' },
  'AUTH-6': { domain: 'AUTH', description: 'Incorrect email or password' },
  'AUTH-7': { domain: 'AUTH', description: 'Sign-in link came from an untrusted origin' },
  'DB-1': { domain: 'DB', description: 'Database operation failed' },
  'DB-2': { domain: 'DB', description: 'Requested record not found' },
  'DB-3': { domain: 'DB', description: 'Erasure did not complete and was rolled back' },
  'DB-4': { domain: 'DB', description: 'Stored files must be removed before the record' },
  'EVENTS-1': { domain: 'EVENTS', description: 'Event capacity is full' },
  'NETWORK-1': { domain: 'NETWORK', description: 'Network request failed' },
  'PUSH-1': { domain: 'PUSH', description: 'Push dispatch authorization failed' },
  'PUSH-2': { domain: 'PUSH', description: 'Push send failed after transient retries' },
  'PUSH-3': { domain: 'PUSH', description: 'Push payload or provider response is invalid' },
  'PUSH-4': { domain: 'PUSH', description: 'Push provider permanently rejected a message' },
  'PUSH-5': { domain: 'PUSH', description: 'Push receipt lookup failed' },
  'PUSH-6': { domain: 'PUSH', description: 'Push receipt was not available before expiry' },
  'PUSH-7': { domain: 'PUSH', description: 'Push delivery state could not be recorded' },
  'PUSH-8': { domain: 'PUSH', description: 'Push send outcome is ambiguous and will be retried' },
  'SYNC-1': { domain: 'SYNC', description: 'Offline sync failed' },
  'UPLOAD-1': { domain: 'UPLOAD', description: 'File upload failed' },
  'UPLOAD-2': { domain: 'UPLOAD', description: 'File type is not allowed' },
  'UPLOAD-3': { domain: 'UPLOAD', description: 'File is larger than the allowed size' },
  'UPLOAD-4': { domain: 'UPLOAD', description: 'Too many uploads started (rate limited)' },
  'UPLOAD-5': { domain: 'UPLOAD', description: 'Upload authorization expired before the transfer' },
  'UPLOAD-6': { domain: 'UPLOAD', description: 'Storage rejected the upload' },
  'UPLOAD-7': { domain: 'UPLOAD', description: 'Removing stored files failed' },
  'TRANSLATION-1': { domain: 'TRANSLATION', description: 'Translation provider request failed' },
  'TRANSLATION-2': {
    domain: 'TRANSLATION',
    description: 'Translation provider response was invalid',
  },
  'TRANSLATION-3': { domain: 'TRANSLATION', description: 'Too many translations requested' },
  'TRANSLATION-4': { domain: 'TRANSLATION', description: 'Translation review state is invalid' },
  'TRANSLATION-5': { domain: 'TRANSLATION', description: 'Translation provider is unavailable' },
  'VALIDATION-1': { domain: 'VALIDATION', description: 'Input failed validation' },
  'UNEXPECTED-1': { domain: 'UNEXPECTED', description: 'Unexpected error' },
});

export type AppErrorCode = keyof typeof errorCodeRegistry;
export type PushAppErrorCode = Extract<AppErrorCode, `PUSH-${number}`>;

export const UNEXPECTED_ERROR_CODE = 'UNEXPECTED-1' satisfies AppErrorCode;

export function getErrorMessageKey(code: AppErrorCode): `errors:${AppErrorCode}` {
  return `errors:${code}`;
}

export interface AppErrorOptions {
  readonly message?: string;
  readonly context?: Record<string, unknown>;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly domain: ErrorDomain;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? errorCodeRegistry[code].description, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.domain = errorCodeRegistry[code].domain;
    this.context = options.context ?? {};
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function toAppError(
  thrown: unknown,
  code: AppErrorCode = UNEXPECTED_ERROR_CODE,
  context?: Record<string, unknown>,
): AppError {
  if (isAppError(thrown)) return thrown;

  if (thrown instanceof Error) {
    return new AppError(code, { message: thrown.message, context, cause: thrown });
  }

  return new AppError(code, {
    context: { ...context, thrownValue: String(thrown) },
    cause: thrown,
  });
}
