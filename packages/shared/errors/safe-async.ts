/**
 * `safeAsync`: the required wrapper for every async operation that can fail
 * (workflow contract rule 7). It converts thrown failures into a typed
 * `Result<T, AppError>` and NEVER rejects, so unhandled promise rejections are
 * impossible by construction (SPEC Engineering Standards, hard rule).
 *
 * Logging and Sentry reporting are injected through `onError` rather than
 * imported here, mirroring the storage-adapter pattern of the Supabase and
 * i18n factories: each app wires `onError` once (see its observability setup),
 * and feature code just consumes the wired helper.
 */

import { toAppError, type AppError } from './app-error';
import type { AppErrorCode } from './codes';

export type Result<Value, Failure = AppError> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: Failure };

export function ok<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

export function err<Failure>(error: Failure): Result<never, Failure> {
  return { ok: false, error };
}

export interface SafeAsyncOptions {
  /** Code a non-AppError failure is normalized under. Defaults to UNEXPECTED-1. */
  readonly code?: AppErrorCode;
  /** Structured, PII-free detail merged into a normalized failure. */
  readonly context?: Record<string, unknown>;
  /** Observation hook (logging, Sentry). Its own failures are swallowed. */
  readonly onError?: (error: AppError) => void;
}

export async function safeAsync<Value>(
  operation: () => Promise<Value> | Value,
  options: SafeAsyncOptions = {},
): Promise<Result<Value, AppError>> {
  try {
    return ok(await operation());
  } catch (thrown) {
    const error = toAppError(thrown, options.code, options.context);
    try {
      options.onError?.(error);
    } catch {
      // A broken observation hook must never turn a handled failure back into
      // an unhandled rejection; the typed error still reaches the caller.
    }
    return err(error);
  }
}
