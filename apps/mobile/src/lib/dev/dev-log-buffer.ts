/**
 * The in-app log viewer's buffer (RAPP-19, SPEC "Log viewer").
 *
 * `createLogger` already takes a `sink`, so the viewer needs no change to the
 * logger contract: the mobile wiring adds this buffer as a SECOND sink beside
 * the console one, in `__DEV__` only. Entries arrive already PII-redacted,
 * because redaction happens inside the logger before the sink is called.
 *
 * `entries()` returns the same array reference until the next write, so the
 * viewer can read it through `useSyncExternalStore` without re-rendering
 * forever.
 */

import { logLevels, type LogEntry, type LogLevel, type LogSink } from '@ramassa/shared/logger';

export interface DevLogEntry extends LogEntry {
  readonly id: number;
}

export interface DevLogBuffer {
  readonly sink: LogSink;
  /** Newest first. Referentially stable between writes. */
  entries(): readonly DevLogEntry[];
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function createDevLogBuffer(options: { capacity: number }): DevLogBuffer {
  const { capacity } = options;
  let entries: readonly DevLogEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    sink(entry) {
      entries = [{ ...entry, id: nextId }, ...entries].slice(0, capacity);
      nextId += 1;
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

/** Keeps entries at or above `minimumLevel`, using the logger's own ordering. */
export function filterLogEntries<Entry extends LogEntry>(
  entries: readonly Entry[],
  minimumLevel: LogLevel,
): readonly Entry[] {
  const threshold = logLevels.indexOf(minimumLevel);
  return entries.filter((entry) => logLevels.indexOf(entry.level) >= threshold);
}
