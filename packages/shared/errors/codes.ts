/**
 * The stable error-code registry: the single place a failure mode gets a name.
 *
 * Codes are `DOMAIN-N` (`AUTH-1`, `UPLOAD-2`...) because they are read aloud:
 * fallback screens show the code beside the friendly message so staff can
 * report exactly what happened ("it says AUTH-3") without understanding stacks.
 *
 * Rules (RAPP-12):
 *   - Codes are APPEND-ONLY. Never renumber, reuse, or delete a shipped code;
 *     a code in a user's screenshot must mean the same thing forever.
 *   - `description` is the developer-facing default message (logs, Sentry).
 *     The user-facing message is the translated `errors:<code>` i18n key,
 *     which must land in ALL five locales in the same change as the code.
 *   - Feature issues append their domain codes here as they arrive.
 */

export const errorDomains = [
  'AUTH',
  'DB',
  'NETWORK',
  'SYNC',
  'UPLOAD',
  'VALIDATION',
  'UNEXPECTED',
] as const;

export type ErrorDomain = (typeof errorDomains)[number];

interface ErrorCodeDefinition {
  readonly domain: ErrorDomain;
  /** Developer-facing default message; never shown to users untranslated. */
  readonly description: string;
}

function defineCodes<const Registry extends Record<string, ErrorCodeDefinition>>(
  registry: Registry,
): Registry {
  return registry;
}

export const errorCodeRegistry = defineCodes({
  'AUTH-1': { domain: 'AUTH', description: 'Sign-in failed' },
  'AUTH-2': { domain: 'AUTH', description: 'Session expired or invalid' },
  'AUTH-3': { domain: 'AUTH', description: 'Not authorized for this action' },
  'DB-1': { domain: 'DB', description: 'Database operation failed' },
  'DB-2': { domain: 'DB', description: 'Requested record not found' },
  'NETWORK-1': { domain: 'NETWORK', description: 'Network request failed' },
  'SYNC-1': { domain: 'SYNC', description: 'Offline sync failed' },
  'UPLOAD-1': { domain: 'UPLOAD', description: 'File upload failed' },
  'VALIDATION-1': { domain: 'VALIDATION', description: 'Input failed validation' },
  'UNEXPECTED-1': { domain: 'UNEXPECTED', description: 'Unexpected error' },
});

export type AppErrorCode = keyof typeof errorCodeRegistry;

/** The catch-all code every unrecognized failure is normalized to. */
export const UNEXPECTED_ERROR_CODE = 'UNEXPECTED-1' satisfies AppErrorCode;

/**
 * The i18n key (in the `errors` namespace) holding the translated, user-facing
 * message for a code. Every code has a key in all five locales, enforced by test.
 */
export function getErrorMessageKey(code: AppErrorCode): `errors:${AppErrorCode}` {
  return `errors:${code}`;
}
