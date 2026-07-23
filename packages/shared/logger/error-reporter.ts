/**
 * The reporting seam between shared code and Sentry. Shared code depends only
 * on this interface (dependency injection over hard imports, CONVENTIONS.md);
 * each app implements it with its own Sentry SDK — `@sentry/react-native` on
 * mobile, `@sentry/tanstackstart-react` on admin — so no Sentry package ever
 * enters the shared bundle. Context handed to a reporter has ALREADY been
 * PII-redacted by the logger.
 */

import type { AppError } from '../errors';

export interface ErrorReporter {
  captureError(error: AppError, context?: Record<string, unknown>): void;
}

/** Default when no DSN is configured (tests, local dev): reporting is off. */
export function createNoopErrorReporter(): ErrorReporter {
  return { captureError: () => {} };
}
