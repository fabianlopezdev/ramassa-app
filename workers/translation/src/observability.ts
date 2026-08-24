import * as Sentry from '@sentry/cloudflare';
import { isAppError, toAppError } from '@ramassa/shared/errors';
import {
  buildRedactedErrorReportExtra,
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
        extra: buildRedactedErrorReportExtra(error, context),
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
    baseContext: { runtime: 'translation-worker' },
  });
  return {
    logger,
    reportError(thrown, context) {
      const error = toAppError(thrown);
      const level = isAppError(thrown) ? 'warn' : 'error';
      logger[level](error.message, { ...context, error, code: error.code });
    },
  };
}
