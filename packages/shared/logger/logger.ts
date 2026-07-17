/**
 * Structured, leveled logger (SPEC Logger Utility, upgraded by RAPP-12).
 * Every entry's context is PII-redacted before it reaches the sink, and
 * `error`-level entries are forwarded to the injected `ErrorReporter`
 * (Sentry in production) as typed `AppError`s. A broken sink or reporter
 * never breaks the calling feature.
 */

import { toAppError } from '../errors';
import type { ErrorReporter } from './error-reporter';
import { redactPii } from './redact';

export const logLevels = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof logLevels)[number];

const levelRank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: Record<string, unknown>;
  readonly timestamp: string;
}

export type LogSink = (entry: LogEntry) => void;

/**
 * Context for a log call. The `error` key is special-cased at `error` level:
 * it is normalized to `AppError` and forwarded to the reporter.
 */
export type LogContext = Record<string, unknown> & { error?: unknown };

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export interface CreateLoggerOptions {
  /** Entries below this level are dropped. Defaults to `debug`. */
  readonly minimumLevel?: LogLevel;
  /** Where entries go. Defaults to the console. */
  readonly sink?: LogSink;
  /** Receives every `error`-level entry's failure. Defaults to none. */
  readonly reporter?: ErrorReporter;
  /** Merged into every entry (e.g. `{ runtime: 'mobile' }`). */
  readonly baseContext?: Record<string, unknown>;
}

const consoleSink: LogSink = (entry) => {
  console[entry.level](`[${entry.level}] ${entry.message}`, entry.context);
};

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const { minimumLevel = 'debug', sink = consoleSink, reporter, baseContext = {} } = options;

  function log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (levelRank[level] < levelRank[minimumLevel]) {
      return;
    }

    const { error: rawError, ...plainContext } = context;
    const redactedContext = redactPii({ ...baseContext, ...plainContext }) as Record<
      string,
      unknown
    >;

    const entry: LogEntry = {
      level,
      message,
      context:
        rawError === undefined
          ? redactedContext
          : { ...redactedContext, error: redactPii(rawError) },
      timestamp: new Date().toISOString(),
    };

    try {
      sink(entry);
    } catch {
      // A broken sink must never take a feature down with it.
    }

    if (level === 'error' && reporter !== undefined) {
      try {
        reporter.captureError(toAppError(rawError ?? message), redactedContext);
      } catch {
        // Reporting is best-effort; the entry already reached the sink.
      }
    }
  }

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
  };
}
