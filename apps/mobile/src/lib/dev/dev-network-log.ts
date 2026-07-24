/**
 * The dev menu's network inspector (RAPP-19, SPEC "Network inspector").
 *
 * supabase-js and the R2 upload client both go through global `fetch`, so one
 * `__DEV__`-only wrapper sees every request either of them makes without either
 * knowing about it. Nothing in production is touched.
 *
 * Scope note, honestly stated: in Phase 1 the only traffic that exists is auth
 * (token grants, magic-link verification), the `profiles` role lookup, and the
 * `push_tokens` upsert. The `r2-upload` lane is wired now because the upload
 * client already exists (`@ramassa/shared/upload-client`), but it stays empty
 * until the first upload feature lands in Phase 3.
 *
 * URLs are redacted before they are stored. A magic-link callback carries a real
 * access token in its query string, and a dev screen that renders it is a
 * shoulder-surfing hazard and a screenshot hazard.
 */

export type DevRequestKind =
  | 'supabase-auth'
  | 'supabase-rest'
  | 'supabase-storage'
  | 'supabase-realtime'
  | 'r2-upload'
  | 'other';

export interface DevNetworkEntry {
  readonly id: number;
  readonly method: string;
  /** Already redacted. Safe to render and to screenshot. */
  readonly url: string;
  readonly kind: DevRequestKind;
  readonly status?: number;
  readonly durationMs: number;
  readonly startedAt: number;
  readonly failed: boolean;
}

export type DevNetworkRecord = Omit<DevNetworkEntry, 'id' | 'failed'> & { failed?: boolean };

export interface DevNetworkLog {
  record(entry: DevNetworkRecord): void;
  /** Newest first. Referentially stable between writes. */
  entries(): readonly DevNetworkEntry[];
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const TOKEN_QUERY_PARAMETERS = ['access_token', 'refresh_token', 'apikey', 'token'];
const REDACTED_VALUE = '[redacted]';

/**
 * Path-based, not method-based: Supabase routes everything through one origin,
 * and an auth failure and a data failure need to be told apart at a glance.
 */
export function classifyRequestKind(url: string, supabaseUrl: string | undefined): DevRequestKind {
  if (url.includes('.r2.cloudflarestorage.com')) {
    return 'r2-upload';
  }
  if (supabaseUrl === undefined || !url.startsWith(supabaseUrl)) {
    return 'other';
  }
  const path = url.slice(supabaseUrl.length);
  if (path.startsWith('/auth/')) return 'supabase-auth';
  if (path.startsWith('/rest/')) return 'supabase-rest';
  if (path.startsWith('/storage/')) return 'supabase-storage';
  if (path.startsWith('/realtime/')) return 'supabase-realtime';
  return 'other';
}

/** Strips credentials that ride in the query string. Non-URLs pass through. */
export function redactRequestUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  let didRedact = false;
  for (const parameter of TOKEN_QUERY_PARAMETERS) {
    if (parsed.searchParams.has(parameter)) {
      parsed.searchParams.set(parameter, REDACTED_VALUE);
      didRedact = true;
    }
  }
  return didRedact ? parsed.toString() : url;
}

export function createDevNetworkLog(options: { capacity: number }): DevNetworkLog {
  const { capacity } = options;
  let entries: readonly DevNetworkEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    record(entry) {
      const recorded: DevNetworkEntry = { ...entry, id: nextId, failed: entry.failed ?? false };
      nextId += 1;
      entries = [recorded, ...entries].slice(0, capacity);
      notify();
    },
    entries: () => entries,
    clear() {
      entries = [];
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Structural rather than `typeof fetch`: the DOM lib's `fetch` carries static
 * members (`preconnect`) that a wrapper has no business reimplementing and a
 * test fake has no business owning.
 */
export type FetchLike = (...args: Parameters<typeof fetch>) => Promise<Response>;

/** The scope holding the `fetch` to wrap. `globalThis` in the app, a fake in tests. */
export interface DevFetchScope {
  fetch: FetchLike;
}

interface InstrumentedFetch extends FetchLike {
  [INSTRUMENTED_MARKER]?: true;
}

const INSTRUMENTED_MARKER = Symbol.for('ramassa.devFetchLogger');

function readRequestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function readRequestMethod(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): string {
  if (init?.method !== undefined) return init.method.toUpperCase();
  if (typeof input !== 'string' && !(input instanceof URL)) return input.method.toUpperCase();
  return 'GET';
}

export interface InstallDevFetchLoggerOptions {
  readonly scope: DevFetchScope;
  readonly log: DevNetworkLog;
  readonly now: () => number;
  readonly supabaseUrl: string | undefined;
}

/**
 * Wraps `scope.fetch` and returns an uninstall function.
 *
 * Idempotent by a marker on the wrapper, because Fast Refresh re-runs module
 * side effects: without it, editing this file mid-session would stack wrappers
 * and every request would be logged N times.
 */
export function installDevFetchLogger(options: InstallDevFetchLoggerOptions): () => void {
  const { scope, log, now, supabaseUrl } = options;
  const originalFetch: InstrumentedFetch = scope.fetch;

  if (originalFetch[INSTRUMENTED_MARKER] === true) {
    return () => undefined;
  }

  const instrumentedFetch: InstrumentedFetch = async (input, init) => {
    const startedAt = now();
    const method = readRequestMethod(input, init);
    const url = redactRequestUrl(readRequestUrl(input));
    const kind = classifyRequestKind(url, supabaseUrl);

    try {
      const response = await originalFetch(input, init);
      log.record({
        method,
        url,
        kind,
        status: response.status,
        durationMs: now() - startedAt,
        startedAt,
      });
      return response;
    } catch (cause) {
      log.record({ method, url, kind, durationMs: now() - startedAt, startedAt, failed: true });
      throw cause;
    }
  };
  instrumentedFetch[INSTRUMENTED_MARKER] = true;

  scope.fetch = instrumentedFetch;
  return () => {
    scope.fetch = originalFetch;
  };
}
