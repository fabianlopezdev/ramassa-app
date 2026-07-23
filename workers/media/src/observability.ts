/**
 * Worker observability (RAPP-12 item 4, completed here): the ONE place this
 * Worker touches the Sentry SDK, mirroring `lib/observability.ts` in the mobile
 * and admin apps. Handlers receive `reportError` as an injected dependency and
 * never import Sentry themselves.
 *
 * Everything passes through the shared logger first, so its PII redaction
 * applies to Worker logs exactly as it does on the other two runtimes.
 */

import * as Sentry from '@sentry/cloudflare';
import { isAppError, toAppError } from '@ramassa/shared/errors';
import {
  createLogger,
  createNoopErrorReporter,
  type ErrorReporter,
  type Logger,
} from '@ramassa/shared/logger';

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

export interface WorkerObservability {
  readonly logger: Logger;
  readonly reportError: (thrown: unknown, context?: Record<string, unknown>) => void;
}

export function createWorkerObservability(options: {
  readonly sentryDsn: string | undefined;
  readonly isLocal: boolean;
}): WorkerObservability {
  const logger = createLogger({
    minimumLevel: options.isLocal ? 'debug' : 'info',
    reporter:
      options.sentryDsn === undefined || options.sentryDsn.length === 0
        ? createNoopErrorReporter()
        : createSentryErrorReporter(),
    baseContext: { runtime: 'media-worker' },
  });

  return {
    logger,
    reportError(thrown, context) {
      const error = toAppError(thrown);
      // An expected denial (bad token, oversized file) is not an incident; it is
      // logged at warn and never paged on. Only surprises become errors.
      const level = isAppError(thrown) ? 'warn' : 'error';
      logger[level](error.message, { ...context, error, code: error.code });
    },
  };
}
