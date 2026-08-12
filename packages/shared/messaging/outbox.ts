const MESSAGING_OUTBOX_KEY = 'ramassa.messaging-outbox.v1';
const MESSAGING_OUTBOX_VERSION = 1;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const RETRY_BACKOFF_BASE = 2;

export interface MessagingOutboxStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

export interface EnqueueMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly content: string | null;
  readonly imageUrl: string | null;
  readonly createdAt: string;
}

export interface MessagingOutboxEntry extends EnqueueMessage {
  readonly ownerId: string;
  readonly attemptCount: number;
  readonly retryAt: string | null;
}

export interface MessagingDrainResult<Result> {
  readonly delivered: readonly Result[];
  readonly failed: number;
  readonly nextRetryAt: string | null;
}

const drainTails = new WeakMap<MessagingOutboxStorage, Map<string, Promise<void>>>();

function isMessagingOutboxEntry(value: unknown): value is MessagingOutboxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.conversationId === 'string' &&
    entry.conversationId.length > 0 &&
    typeof entry.ownerId === 'string' &&
    entry.ownerId.length > 0 &&
    (typeof entry.content === 'string' || entry.content === null) &&
    (typeof entry.imageUrl === 'string' || entry.imageUrl === null) &&
    typeof entry.createdAt === 'string' &&
    Number.isFinite(Date.parse(entry.createdAt)) &&
    typeof entry.attemptCount === 'number' &&
    Number.isInteger(entry.attemptCount) &&
    entry.attemptCount >= 0 &&
    (entry.retryAt === null ||
      (typeof entry.retryAt === 'string' && Number.isFinite(Date.parse(entry.retryAt))))
  );
}

async function serializeDrain<Result>(
  storage: MessagingOutboxStorage,
  ownerId: string,
  execute: () => Promise<Result>,
): Promise<Result> {
  let ownerTails = drainTails.get(storage);
  if (ownerTails === undefined) {
    ownerTails = new Map();
    drainTails.set(storage, ownerTails);
  }
  const previous = ownerTails.get(ownerId);
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = (previous ?? Promise.resolve()).then(() => turn);
  ownerTails.set(ownerId, tail);
  if (previous !== undefined) await previous;
  try {
    return await execute();
  } finally {
    release();
    if (ownerTails.get(ownerId) === tail) {
      ownerTails.delete(ownerId);
      if (ownerTails.size === 0) drainTails.delete(storage);
    }
  }
}

function readEntries(storage: MessagingOutboxStorage): readonly MessagingOutboxEntry[] {
  const serialized = storage.getString(MESSAGING_OUTBOX_KEY);
  if (serialized === undefined) return [];
  try {
    const parsed = JSON.parse(serialized) as {
      readonly entries?: readonly MessagingOutboxEntry[];
    };
    return Array.isArray(parsed.entries) ? parsed.entries.filter(isMessagingOutboxEntry) : [];
  } catch {
    return [];
  }
}

function writeEntries(
  storage: MessagingOutboxStorage,
  entries: readonly MessagingOutboxEntry[],
): void {
  if (entries.length === 0) {
    storage.remove(MESSAGING_OUTBOX_KEY);
    return;
  }
  storage.set(MESSAGING_OUTBOX_KEY, JSON.stringify({ version: MESSAGING_OUTBOX_VERSION, entries }));
}

export function createMessagingOutbox(storage: MessagingOutboxStorage, ownerId: string) {
  return {
    list: (): readonly MessagingOutboxEntry[] =>
      readEntries(storage)
        .filter((entry) => entry.ownerId === ownerId)
        .sort((left, right) => {
          const createdOrder = left.createdAt.localeCompare(right.createdAt);
          return createdOrder === 0 ? left.id.localeCompare(right.id) : createdOrder;
        }),
    enqueue: (input: EnqueueMessage): MessagingOutboxEntry => {
      const entry: MessagingOutboxEntry = {
        ...input,
        ownerId,
        attemptCount: 0,
        retryAt: null,
      };
      const entries = readEntries(storage).filter(
        (candidate) => candidate.ownerId !== ownerId || candidate.id !== entry.id,
      );
      writeEntries(storage, [...entries, entry]);
      return entry;
    },
    drain: <Result>(
      send: (entry: MessagingOutboxEntry) => Promise<Result>,
      now: Date = new Date(),
    ): Promise<MessagingDrainResult<Result>> =>
      serializeDrain(storage, ownerId, async () => {
        const nowMs = now.getTime();
        const pending = readEntries(storage)
          .filter((entry) => entry.ownerId === ownerId)
          .sort((left, right) => {
            const createdOrder = left.createdAt.localeCompare(right.createdAt);
            return createdOrder === 0 ? left.id.localeCompare(right.id) : createdOrder;
          });
        const delivered: Result[] = [];
        let failed = 0;

        for (const entry of pending) {
          if (entry.retryAt !== null && Date.parse(entry.retryAt) > nowMs) break;
          try {
            const result = await send(entry);
            delivered.push(result);
            writeEntries(
              storage,
              readEntries(storage).filter(
                (candidate) =>
                  candidate.ownerId !== ownerId ||
                  candidate.id !== entry.id ||
                  candidate.createdAt !== entry.createdAt,
              ),
            );
          } catch {
            const attemptCount = entry.attemptCount + 1;
            const delayMs = Math.min(
              RETRY_MAX_MS,
              RETRY_BASE_MS * RETRY_BACKOFF_BASE ** (attemptCount - 1),
            );
            const retryAt = new Date(nowMs + delayMs).toISOString();
            writeEntries(
              storage,
              readEntries(storage).map((candidate) =>
                candidate.ownerId === ownerId &&
                candidate.id === entry.id &&
                candidate.createdAt === entry.createdAt
                  ? { ...candidate, attemptCount, retryAt }
                  : candidate,
              ),
            );
            failed += 1;
            break;
          }
        }

        let nextRetryAt: string | null = null;
        for (const entry of readEntries(storage)) {
          if (
            entry.ownerId === ownerId &&
            entry.retryAt !== null &&
            (nextRetryAt === null || entry.retryAt < nextRetryAt)
          ) {
            nextRetryAt = entry.retryAt;
          }
        }
        return { delivered, failed, nextRetryAt };
      }),
  };
}
