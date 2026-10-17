import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { TabletSigning } from '@ramassa/shared/authorization';
import { AppError } from '@ramassa/shared/errors';
import { createSigningOutbox, pendingSigningCount, SIGNING_OUTBOX_KEY } from './signing-outbox';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getString(key: string) {
    return this.values.get(key);
  }
  set(key: string, value: string) {
    this.values.set(key, value);
  }
  remove(key: string) {
    return this.values.delete(key);
  }
}

const signing: TabletSigning = {
  id: '0b5e0000-0000-4000-8000-000000000001',
  signer: { kind: 'player', profileId: 'p-22', name: 'Наталія' },
  versionId: 'v-1',
  payload: { consents: { participation: true }, health_info: 'No', language: 'ar' },
  signedAt: '2026-10-16T17:00:00.000Z',
};
const walkIn: TabletSigning = {
  ...signing,
  id: '0b5e0000-0000-4000-8000-000000000002',
  signer: { kind: 'walk_in', firstName: 'Rim', lastName: 'Haddad' },
  signedAt: '2026-10-16T17:05:00.000Z',
};

describe('signing outbox', () => {
  test('keeps a signing until the server has it, then deletes it from the tablet', async () => {
    const storage = new MemoryStorage();
    const outbox = createSigningOutbox(storage, 'coach-1');
    outbox.enqueue(signing);
    outbox.enqueue(walkIn);
    expect(pendingSigningCount(storage, 'coach-1')).toBe(2);

    await outbox.drain(() => Promise.reject(new Error('Network request failed')));
    expect(pendingSigningCount(storage, 'coach-1')).toBe(2);

    const sent: string[] = [];
    const later = new Date(Date.now() + 60_000);
    await outbox.drain((entry) => {
      sent.push(entry.signer.kind);
      return Promise.resolve(entry.id);
    }, later);
    expect(sent).toEqual(['player', 'walk_in']);
    expect(pendingSigningCount(storage, 'coach-1')).toBe(0);
    // Nothing of hers is left in storage once the server confirmed it.
    expect(storage.values.has(SIGNING_OUTBOX_KEY)).toBe(false);
  });

  test('a refusal stays, marked, and still counts as waiting', async () => {
    const storage = new MemoryStorage();
    const outbox = createSigningOutbox(storage, 'coach-1');
    outbox.enqueue(signing);
    await outbox.drain(() => Promise.reject(new AppError('AUTH-3')));
    expect(outbox.list()[0]?.rejection?.code).toBe('AUTH-3');
    expect(pendingSigningCount(storage, 'coach-1')).toBe(1);
  });

  test("another account on the same tablet never sees or sends a coach's signings", async () => {
    const storage = new MemoryStorage();
    createSigningOutbox(storage, 'coach-1').enqueue(signing);
    const other = createSigningOutbox(storage, 'coach-2');
    expect(other.list()).toHaveLength(0);
    await other.drain(() => Promise.resolve('x'));
    expect(pendingSigningCount(storage, 'coach-1')).toBe(1);
  });
});

test('the signing outbox is only ever opened on the encrypted private storage', () => {
  const source = readFileSync(resolve(import.meta.dir, 'tablet-signing.ts'), 'utf8');
  const opened = [...source.matchAll(/(?:createSigningOutbox|pendingSigningCount)\((\w+)/g)].map(
    ([, storage]) => storage,
  );
  expect(opened.length).toBeGreaterThan(0);
  expect(new Set(opened)).toEqual(new Set(['privateStorage']));
});
