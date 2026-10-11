import {
  createOutbox,
  type OutboxConfig,
  type OutboxEntry,
  type OutboxStorage,
} from '../offline/outbox';

const MESSAGING_OUTBOX_KEY = 'ramassa.messaging-outbox.v1';
const MESSAGING_OUTBOX_VERSION = 1;

export type MessagingOutboxStorage = OutboxStorage;

export interface EnqueueMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly content: string | null;
  readonly imageUrl: string | null;
  readonly createdAt: string;
}

export interface MessagingOutboxEntry extends EnqueueMessage, OutboxEntry {}

export interface MessagingDrainResult<Result> {
  readonly delivered: readonly Result[];
  readonly failed: number;
  readonly rejected: number;
  readonly nextRetryAt: string | null;
}

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

const byCreatedThenId = (left: MessagingOutboxEntry, right: MessagingOutboxEntry) => {
  const createdOrder = left.createdAt.localeCompare(right.createdAt);
  return createdOrder === 0 ? left.id.localeCompare(right.id) : createdOrder;
};

const MESSAGING_OUTBOX: OutboxConfig<MessagingOutboxEntry> = {
  key: MESSAGING_OUTBOX_KEY,
  version: MESSAGING_OUTBOX_VERSION,
  isEntry: isMessagingOutboxEntry,
  compare: byCreatedThenId,
  isSameVersion: (left, right) => left.id === right.id && left.createdAt === right.createdAt,
  // Messages keep their order: a later one waits while an earlier one retries.
  mode: 'sequential',
};

/**
 * Messages on the shared outbox (RAPP-237). The idempotency key is the message
 * id the phone makes; `send_message` stores one row per id, so a repeated send
 * changes nothing.
 */
export function createMessagingOutbox(storage: MessagingOutboxStorage, ownerId: string) {
  const outbox = createOutbox(storage, ownerId, MESSAGING_OUTBOX);
  return {
    list: outbox.list,
    retry: outbox.retry,
    discard: outbox.discard,
    enqueue: (input: EnqueueMessage): MessagingOutboxEntry => outbox.enqueue({ ...input }),
    drain: async <Result>(
      send: (entry: MessagingOutboxEntry) => Promise<Result>,
      now: Date = new Date(),
    ): Promise<MessagingDrainResult<Result>> => {
      const result = await outbox.drain(send, now);
      return {
        delivered: result.delivered,
        failed: result.failed,
        rejected: result.rejected,
        nextRetryAt: result.nextRetryAt,
      };
    },
  };
}
