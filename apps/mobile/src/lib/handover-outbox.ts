/**
 * Handovers on the shared offline outbox (RAPP-249): at the pitch there is
 * often no signal, and a handover with her signature must never be lost. The
 * entry waits in encrypted storage and goes out when the phone is online.
 *
 * The idempotency key is the handover's own id, made on the phone. The server
 * returns the saved record when it sees the id again, so a retry after a lost
 * answer saves nothing twice.
 */
import {
  HANDOVER_MODES,
  STATEMENT_LANGUAGES,
  type HandoverInput,
  type HandoverResult,
} from '@ramassa/shared/equipment';
import {
  createOutbox,
  type OutboxConfig,
  type OutboxEntry,
  type OutboxStorage,
} from '@ramassa/shared/offline';

const HANDOVER_OUTBOX_KEY = 'ramassa.handover-outbox.v1';
const HANDOVER_OUTBOX_SCHEMA_VERSION = 1;

export interface HandoverOutboxEntry extends OutboxEntry, HandoverInput {
  /** For the waiting row on her card before the server answers. */
  readonly itemKey: string;
}

export type EnqueueHandover = HandoverInput & { readonly itemKey: string };

function isSignature(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const signature = value as Record<string, unknown>;
  if (signature.state === 'signed') return Array.isArray(signature.strokes);
  return (
    (signature.state === 'refused' || signature.state === 'unable') &&
    typeof signature.reason === 'string'
  );
}

function isHandoverOutboxEntry(value: unknown): value is HandoverOutboxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.ownerId === 'string' &&
    typeof entry.handedOverAt === 'string' &&
    typeof entry.participantId === 'string' &&
    typeof entry.itemTypeId === 'string' &&
    typeof entry.itemKey === 'string' &&
    (entry.size === null || typeof entry.size === 'string') &&
    (HANDOVER_MODES as readonly unknown[]).includes(entry.mode) &&
    (STATEMENT_LANGUAGES as readonly unknown[]).includes(entry.statementLanguage) &&
    isSignature(entry.signature) &&
    typeof entry.attemptCount === 'number' &&
    (entry.retryAt === null || typeof entry.retryAt === 'string')
  );
}

const HANDOVER_OUTBOX: OutboxConfig<HandoverOutboxEntry> = {
  key: HANDOVER_OUTBOX_KEY,
  version: HANDOVER_OUTBOX_SCHEMA_VERSION,
  isEntry: isHandoverOutboxEntry,
  compare: (left, right) => left.handedOverAt.localeCompare(right.handedOverAt),
  isSameVersion: (left, right) => left.id === right.id,
  mode: 'independent',
};

export function createHandoverOutbox(storage: OutboxStorage, ownerId: string) {
  const outbox = createOutbox(storage, ownerId, HANDOVER_OUTBOX);
  return {
    list: outbox.list,
    retry: outbox.retry,
    discard: outbox.discard,
    enqueue: (input: EnqueueHandover): HandoverOutboxEntry => outbox.enqueue(input),
    drain: (send: (entry: HandoverOutboxEntry) => Promise<HandoverResult>, now?: Date) =>
      outbox.drain(send, now),
  };
}
