/**
 * The shared offline outbox (RAPP-237): changes made without a connection wait
 * in encrypted storage on the device and go out when it returns. Attendance and
 * messages use it today; any later offline change uses the same core.
 *
 * Every entry carries an idempotency key (its `id`), so sending it twice does
 * the same as sending it once: the server stores one row per key.
 *
 * Two kinds of failure:
 *   - a failure that may pass (no connection, a timeout, a server error) is
 *     retried with a growing delay, up to 30 seconds;
 *   - a send that gets no answer within a time limit counts as a failure that
 *     may pass (RAPP-530): a server that accepts the connection and never
 *     answers would otherwise hold the queue, and every later retry, forever;
 *   - a refusal (no permission, a broken rule, a record that no longer exists)
 *     will fail the same way every time. The entry stays, marked rejected with
 *     its error code, so the screen can say so and offer a retry. It is never
 *     dropped silently.
 *
 * The stored entry shape stays the caller's own, with three bookkeeping fields,
 * so entries saved before this module still load.
 */
import { isAppError, type AppErrorCode } from '../errors';

export interface OutboxStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

export interface OutboxRejection {
  readonly code: AppErrorCode;
  readonly at: string;
}

export interface OutboxEntry {
  readonly id: string;
  readonly ownerId: string;
  readonly attemptCount: number;
  readonly retryAt: string | null;
  /** Absent in entries saved before RAPP-237; read as null. */
  readonly rejection?: OutboxRejection | null;
}

export interface OutboxConfig<Entry extends OutboxEntry> {
  /** The storage key. */
  readonly key: string;
  readonly version: number;
  /** Validates one stored entry; invalid entries are dropped on read. */
  readonly isEntry: (value: unknown) => value is Entry;
  /** The order entries go out in. */
  readonly compare: (left: Entry, right: Entry) => number;
  /**
   * True when two entries are the same change. A newer change under the same
   * id replaces the older one, and a send only removes the version it sent.
   */
  readonly isSameVersion: (left: Entry, right: Entry) => boolean;
  /**
   * `sequential`: later entries wait while an earlier one is waiting to retry
   * (messages keep their order). `independent`: each entry goes on its own.
   */
  readonly mode: 'sequential' | 'independent';
}

export interface OutboxDrainResult<Result> {
  readonly delivered: readonly Result[];
  readonly sent: number;
  readonly failed: number;
  readonly rejected: number;
  readonly nextRetryAt: string | null;
}

const RETRY_BASE_MS = 1_000;
/** How long one send may wait for an answer before it counts as a failed try. */
export const SEND_TIMEOUT_MS = 20_000;
const RETRY_MAX_MS = 30_000;
const RETRY_BACKOFF_BASE = 2;

/** The refusals that fail the same way on every try. */
const FINAL_CODES: ReadonlySet<AppErrorCode> = new Set([
  'AUTH-3',
  'AUTH-9',
  'DB-2',
  'EVENTS-1',
  'VALIDATION-1',
]);

export function isFinalRejection(error: unknown): error is { readonly code: AppErrorCode } {
  return isAppError(error) && FINAL_CODES.has(error.code);
}

class SendTimeoutError extends Error {
  constructor() {
    super('outbox send timed out');
  }
}

/**
 * The send, or a failure after `ms`. The request itself may still finish later;
 * every entry carries its idempotency key, so a late answer saves nothing twice.
 */
function withSendTimeout<Result>(send: Promise<Result>, ms: number): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SendTimeoutError()), ms);
  });
  return Promise.race([send, timeout]).finally(() => clearTimeout(timer));
}

export function retryDelayMs(attemptCount: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * RETRY_BACKOFF_BASE ** (attemptCount - 1));
}

const drainTails = new WeakMap<OutboxStorage, Map<string, Promise<void>>>();

/** One drain at a time per storage, key and owner. */
async function serializeDrain<Result>(
  storage: OutboxStorage,
  lane: string,
  execute: () => Promise<Result>,
): Promise<Result> {
  let tails = drainTails.get(storage);
  if (tails === undefined) {
    tails = new Map();
    drainTails.set(storage, tails);
  }
  const previous = tails.get(lane);
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = (previous ?? Promise.resolve()).then(() => turn);
  tails.set(lane, tail);
  if (previous !== undefined) await previous;
  try {
    return await execute();
  } finally {
    release();
    if (tails.get(lane) === tail) {
      tails.delete(lane);
      if (tails.size === 0) drainTails.delete(storage);
    }
  }
}

export function createOutbox<Entry extends OutboxEntry>(
  storage: OutboxStorage,
  ownerId: string,
  config: OutboxConfig<Entry>,
) {
  function readAll(): readonly Entry[] {
    const serialized = storage.getString(config.key);
    if (serialized === undefined) return [];
    try {
      const parsed = JSON.parse(serialized) as { readonly entries?: readonly unknown[] };
      return Array.isArray(parsed.entries) ? parsed.entries.filter(config.isEntry) : [];
    } catch {
      return [];
    }
  }

  function writeAll(entries: readonly Entry[]): void {
    if (entries.length === 0) {
      storage.remove(config.key);
      return;
    }
    storage.set(config.key, JSON.stringify({ version: config.version, entries }));
  }

  const isMine = (entry: Entry) => entry.ownerId === ownerId;
  const mine = () => readAll().filter(isMine).sort(config.compare);

  function update(target: Entry, change: (entry: Entry) => Entry | null): void {
    const next: Entry[] = [];
    for (const entry of readAll()) {
      if (isMine(entry) && config.isSameVersion(entry, target)) {
        const changed = change(entry);
        if (changed !== null) next.push(changed);
      } else {
        next.push(entry);
      }
    }
    writeAll(next);
  }

  return {
    list: (): readonly Entry[] => mine(),

    /** Adds a change; a pending one with the same id is replaced. */
    enqueue: (entry: Omit<Entry, 'ownerId' | 'attemptCount' | 'retryAt' | 'rejection'>): Entry => {
      const stored = {
        ...entry,
        ownerId,
        attemptCount: 0,
        retryAt: null,
        rejection: null,
      } as unknown as Entry;
      writeAll([
        ...readAll().filter((candidate) => !isMine(candidate) || candidate.id !== stored.id),
        stored,
      ]);
      return stored;
    },

    /** Puts a rejected change back in line, to be sent at the next drain. */
    retry: (id: string): void => {
      const target = mine().find((entry) => entry.id === id);
      if (target === undefined) return;
      update(target, (entry) => ({ ...entry, attemptCount: 0, retryAt: null, rejection: null }));
    },

    /** Removes a change the person has chosen to give up. */
    discard: (id: string): void => {
      writeAll(readAll().filter((entry) => !isMine(entry) || entry.id !== id));
    },

    drain: <Result>(
      send: (entry: Entry) => Promise<Result>,
      now: Date = new Date(),
      options: { readonly sendTimeoutMs?: number } = {},
    ): Promise<OutboxDrainResult<Result>> =>
      serializeDrain(storage, `${config.key}:${ownerId}`, async () => {
        const nowMs = now.getTime();
        const delivered: Result[] = [];
        let failed = 0;
        let rejected = 0;

        for (const entry of mine()) {
          if (entry.rejection != null) continue;
          if (entry.retryAt !== null && Date.parse(entry.retryAt) > nowMs) {
            if (config.mode === 'sequential') break;
            continue;
          }
          try {
            delivered.push(
              await withSendTimeout(send(entry), options.sendTimeoutMs ?? SEND_TIMEOUT_MS),
            );
            update(entry, () => null);
          } catch (error) {
            if (isFinalRejection(error)) {
              update(entry, (current) => ({
                ...current,
                retryAt: null,
                rejection: { code: error.code, at: now.toISOString() },
              }));
              rejected += 1;
              continue;
            }
            const attemptCount = entry.attemptCount + 1;
            const retryAt = new Date(nowMs + retryDelayMs(attemptCount)).toISOString();
            update(entry, (current) => ({ ...current, attemptCount, retryAt }));
            failed += 1;
            if (config.mode === 'sequential') break;
          }
        }

        let nextRetryAt: string | null = null;
        for (const entry of mine()) {
          if (entry.rejection != null || entry.retryAt === null) continue;
          if (nextRetryAt === null || entry.retryAt < nextRetryAt) nextRetryAt = entry.retryAt;
        }
        return { delivered, sent: delivered.length, failed, rejected, nextRetryAt };
      }),
  };
}

export type Outbox<Entry extends OutboxEntry> = ReturnType<typeof createOutbox<Entry>>;
