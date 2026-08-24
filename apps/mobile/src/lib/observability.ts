/**
 * Mobile observability wiring (RAPP-12): the ONE place the app touches the
 * Sentry SDK. Feature code imports `logger` and `safeAsync` from here and
 * never imports `@sentry/react-native` directly — the shared package defines
 * the seams (`ErrorReporter`, `onError`), this module plugs Sentry into them.
 *
 * Initialized at module scope, once per app load, before the first render
 * (imported at the top of the root layout).
 */

import * as Sentry from '@sentry/react-native';
import {
  safeAsync as sharedSafeAsync,
  type AppError,
  type Result,
  type SafeAsyncOptions,
} from '@ramassa/shared/errors';
import {
  buildRedactedErrorReportExtra,
  consoleLogSink,
  createLogger,
  createNoopErrorReporter,
  redactPii,
  type ErrorReporter,
  type LogSink,
} from '@ramassa/shared/logger';

// Literal member access so Metro can inline the values at bundle time
// (dynamic `process.env[...]` lookups are not supported in Expo).
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const commitSha = process.env.EXPO_PUBLIC_COMMIT_SHA;

Sentry.init({
  dsn: sentryDsn,
  // No DSN (local dev without .env, CI) = reporting off, app still boots.
  enabled: Boolean(sentryDsn),
  // PII policy (RAPP-12): never attach user IP / device identifiers; events
  // additionally pass the shared redactor below as a net. Session replay
  // stays off for the same reason.
  sendDefaultPii: false,
  // Release = commit SHA so a dashboard event points at exact code. The SHA
  // is injected by the build (EAS/CI env); local dev builds fall back to the
  // SDK's default release naming. Full pipeline wiring lands with RAPP-68.
  ...(commitSha === undefined ? {} : { release: commitSha, dist: commitSha.slice(0, 12) }),
  beforeSend(event) {
    // Last-resort PII net over everything the SDK collected on its own.
    if (event.extra !== undefined) {
      event.extra = redactPii(event.extra) as typeof event.extra;
    }
    if (event.message !== undefined) {
      event.message = redactPii(event.message) as string;
    }
    for (const exception of event.exception?.values ?? []) {
      if (exception.value !== undefined) {
        exception.value = redactPii(exception.value) as string;
      }
    }
    return event;
  },
});

// The global nets on this runtime: Sentry's default error-handlers
// integration wraps both the fatal JS error handler (ErrorUtils) and
// unhandled promise rejection tracking, so anything that escapes safeAsync
// still reaches the dashboard. `safeAsync` exists so nothing escapes.

function createSentryErrorReporter(): ErrorReporter {
  return {
    captureError(error, context) {
      Sentry.captureException(error, {
        tags: { errorCode: error.code, errorDomain: error.domain },
        extra: buildRedactedErrorReportExtra(error, context),
      });
    },
  };
}

/**
 * Console plus, in dev builds only, the in-app log viewer's ring buffer
 * (RAPP-19). The require sits inside the `__DEV__` branch so Metro folds the
 * branch away before it collects dependencies: neither the buffer nor the
 * network inspector it also installs reaches a release bundle. Asserted by
 * `tests/dev-menu-production-gate.test.ts`, proved end to end by
 * `scripts/verify-dev-menu-excluded.sh`.
 *
 * Importing it HERE is deliberate: this is the first module the app evaluates,
 * so the network inspector is wrapping `fetch` before the Supabase client makes
 * its first request.
 */
function createMobileLogSink(): LogSink {
  const devLogSink = __DEV__
    ? (require('@/lib/dev/dev-instrumentation') as typeof import('@/lib/dev/dev-instrumentation'))
        .devLogSink
    : undefined;

  if (devLogSink === undefined) {
    return consoleLogSink;
  }
  return (entry) => {
    consoleLogSink(entry);
    devLogSink(entry);
  };
}

export const logger = createLogger({
  minimumLevel: __DEV__ ? 'debug' : 'info',
  sink: createMobileLogSink(),
  reporter: sentryDsn === undefined ? createNoopErrorReporter() : createSentryErrorReporter(),
  baseContext: { runtime: 'mobile' },
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

/** Re-exported so the root layout can wrap itself without importing Sentry. */
export const wrapRootComponent = Sentry.wrap;
