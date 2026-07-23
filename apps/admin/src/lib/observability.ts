/**
 * Admin observability wiring (RAPP-12), mirroring the mobile module: the ONE
 * place this app touches the Sentry SDK. Feature code imports `logger` and
 * `safeAsync` from here, never `@sentry/tanstackstart-react` directly.
 */

import * as Sentry from '@sentry/tanstackstart-react';
import {
  safeAsync as sharedSafeAsync,
  type AppError,
  type Result,
  type SafeAsyncOptions,
} from '@ramassa/shared/errors';
import { createLogger, createNoopErrorReporter, type ErrorReporter } from '@ramassa/shared/logger';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

function createSentryErrorReporter(): ErrorReporter {
  return {
    captureError(error, context) {
      Sentry.captureException(error, {
        tags: { errorCode: error.code, errorDomain: error.domain },
        extra: { ...context, errorContext: error.context },
      });
    },
  };
}

export const logger = createLogger({
  minimumLevel: import.meta.env.DEV ? 'debug' : 'info',
  reporter: sentryDsn === undefined ? createNoopErrorReporter() : createSentryErrorReporter(),
  baseContext: { runtime: 'admin' },
});

/**
 * The app-wired `safeAsync`: identical contract to the shared one, with
 * failures automatically logged (redacted) and reported to Sentry. Feature
 * code uses THIS one.
 */
export function safeAsync<Value>(
  operation: () => Promise<Value> | Value,
  options: SafeAsyncOptions = {},
): Promise<Result<Value, AppError>> {
  return sharedSafeAsync(operation, {
    ...options,
    onError(error) {
      logger.error(error.message, { error, ...options.context, code: error.code });
      options.onError?.(error);
    },
  });
}
