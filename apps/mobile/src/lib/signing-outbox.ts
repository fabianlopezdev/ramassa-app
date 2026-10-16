/**
 * Authorizations signed on a staff tablet, on the shared offline outbox
 * (RAPP-305). On the first training day there is often no signal, and a
 * signing holds her medical answer and her signature, so:
 *
 *   - an entry is stored only in `privateStorage` (encrypted MMKV, its key in
 *     the Keychain or Keystore);
 *   - an entry is deleted from the tablet as soon as the server confirms it;
 *   - entries belong to the coach who collected them. After a sign-out, local or
 *     remote, they stay encrypted on the tablet and go out when the same coach
 *     signs in again. They are never handed to another account.
 *
 * The idempotency key is the signing's own id, made on the tablet. The server
 * returns the saved record when it sees the id again.
 */
import type { TabletSigner, TabletSigning } from '@ramassa/shared/authorization';
import {
  createOutbox,
  type OutboxConfig,
  type OutboxEntry,
  type OutboxStorage,
} from '@ramassa/shared/offline';

export const SIGNING_OUTBOX_KEY = 'ramassa.signing-outbox.v1';
const SIGNING_OUTBOX_SCHEMA_VERSION = 1;

export interface SigningOutboxEntry extends OutboxEntry, TabletSigning {}

function isSigner(value: unknown): value is TabletSigner {
  if (typeof value !== 'object' || value === null) return false;
  const signer = value as Record<string, unknown>;
  if (signer.kind === 'player') {
    return typeof signer.profileId === 'string' && typeof signer.name === 'string';
  }
  return (
    signer.kind === 'walk_in' &&
    typeof signer.firstName === 'string' &&
    typeof signer.lastName === 'string'
  );
}

function isSigningOutboxEntry(value: unknown): value is SigningOutboxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.ownerId === 'string' &&
    typeof entry.versionId === 'string' &&
    typeof entry.signedAt === 'string' &&
    typeof entry.payload === 'object' &&
    entry.payload !== null &&
    isSigner(entry.signer) &&
    typeof entry.attemptCount === 'number' &&
    (entry.retryAt === null || typeof entry.retryAt === 'string')
  );
}

const SIGNING_OUTBOX: OutboxConfig<SigningOutboxEntry> = {
  key: SIGNING_OUTBOX_KEY,
  version: SIGNING_OUTBOX_SCHEMA_VERSION,
  isEntry: isSigningOutboxEntry,
  compare: (left, right) => left.signedAt.localeCompare(right.signedAt),
  isSameVersion: (left, right) => left.id === right.id,
  mode: 'independent',
};

export function createSigningOutbox(storage: OutboxStorage, ownerId: string) {
  const outbox = createOutbox(storage, ownerId, SIGNING_OUTBOX);
  return {
    list: outbox.list,
    retry: outbox.retry,
    discard: outbox.discard,
    enqueue: (signing: TabletSigning): SigningOutboxEntry => outbox.enqueue(signing),
    drain: (send: (entry: SigningOutboxEntry) => Promise<string>, now?: Date) =>
      outbox.drain(send, now),
  };
}

/** How many signings wait on this tablet for this coach, refused ones included. */
export function pendingSigningCount(storage: OutboxStorage, ownerId: string): number {
  return createSigningOutbox(storage, ownerId).list().length;
}
