/**
 * `AppError`: the ONLY error app code is allowed to throw (workflow contract
 * rule 7; `throw new Error(...)` is lint-banned outside this package). It is a
 * class, like `EnvironmentValidationError`, because it IS an `Error` — stacks,
 * `instanceof`, and `cause` chaining come for free.
 */

import {
  errorCodeRegistry,
  UNEXPECTED_ERROR_CODE,
  type AppErrorCode,
  type ErrorDomain,
} from './codes';

export interface AppErrorOptions {
  /** Developer-facing detail; defaults to the registry description. */
  readonly message?: string;
  /**
   * Structured detail for logs and Sentry. NEVER put PII here (names, phones,
   * addresses, document numbers) — only opaque IDs and technical facts. The
   * logger redacts known PII keys as a net, but the contract is: it does not
   * enter the error in the first place.
   */
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

/**
 * Normalizes anything thrown into an `AppError` so no failure escapes the
 * taxonomy: an `AppError` passes through untouched, a plain `Error` is wrapped
 * (kept as `cause`, message preserved), and a thrown non-Error value is
 * captured in context instead of being lost.
 */
export function toAppError(
  thrown: unknown,
  code: AppErrorCode = UNEXPECTED_ERROR_CODE,
  context?: Record<string, unknown>,
): AppError {
  if (isAppError(thrown)) {
    return thrown;
  }

  if (thrown instanceof Error) {
    return new AppError(code, { message: thrown.message, context, cause: thrown });
  }

  return new AppError(code, {
    context: { ...context, thrownValue: String(thrown) },
    cause: thrown,
  });
}
