/**
 * Passing a caller's cancellation down into a Supabase request.
 *
 * Why this exists at all: a request that outlives the screen that asked for it
 * is still holding the radio open on a phone the SPEC says is a low-end Android
 * on mobile data. The profile query in particular is refetched on every entry
 * to the tab, so leaving the tab mid-flight used to leave a request running for
 * an answer nobody would read.
 *
 * The signal is OPTIONAL by design. `.abortSignal()` only exists on a real
 * PostgREST builder, and the actions in this package are also called with hand
 * built clients in tests; a caller that passes no signal therefore gets exactly
 * the request it got before, with nothing to stub.
 */

export interface CancellableRequest {
  /** React Query supplies one per query; effects build their own controller. */
  readonly signal?: AbortSignal;
}

/**
 * The slice of a PostgREST builder this helper needs: cancellable, and
 * cancellable into ITSELF.
 *
 * Self-returning rather than `PromiseLike<Result>`, because `.abortSignal()`
 * lives on the transform builder and returns `this`, while the terminal
 * shapes (`.maybeSingle()`, `.single()`) do not carry it at all. Typing the
 * return as a bare promise compiled at the one call site that awaits the
 * builder directly and silently stopped compiling at the one that still had a
 * `.maybeSingle()` to chain — so the constraint is what enforces the ordering:
 * cancel the query, THEN narrow it to one row.
 */
interface AbortableBuilder<Self> {
  abortSignal(signal: AbortSignal): Self;
}

export function withCancellation<Builder extends AbortableBuilder<Builder>>(
  builder: Builder,
  options: CancellableRequest,
): Builder {
  return options.signal === undefined ? builder : builder.abortSignal(options.signal);
}
