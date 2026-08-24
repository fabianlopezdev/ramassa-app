/**
 * The reporting seam between shared code and Sentry. Shared code depends only
 * on this interface (dependency injection over hard imports, CONVENTIONS.md);
 * each app implements it with its own Sentry SDK — `@sentry/react-native` on
 * mobile, `@sentry/tanstackstart-react` on admin — so no Sentry package ever
 * enters the shared bundle. Context handed to a reporter has ALREADY been
 * PII-redacted by the logger.
 */

import type { AppError } from '../errors';
import { redactPii } from './redact';

export interface ErrorReporter {
  captureError(error: AppError, context?: Record<string, unknown>): void;
}

/** Default when no DSN is configured (tests, local dev): reporting is off. */
export function createNoopErrorReporter(): ErrorReporter {
  return { captureError: () => {} };
}

/**
 * The final shared boundary before structured context reaches an error tracker.
 * `AppError.context` is separate from the logger call context, so both must be
 * redacted together.
 */
export function buildRedactedErrorReportExtra(
  error: AppError,
  context: Record<string, unknown> = {},
): Record<string, unknown> {
  return redactPii({ ...context, errorContext: error.context }) as Record<string, unknown>;
}
