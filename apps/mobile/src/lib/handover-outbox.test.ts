import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { createHandoverOutbox, type EnqueueHandover } from './handover-outbox';

class MemoryStorage {
  private readonly values = new Map<string, string>();
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

const handover: EnqueueHandover = {
  id: '00000000-0000-4000-8000-000000000001',
  handedOverAt: '2026-10-12T17:00:00.000Z',
  participantId: 'p-1',
  itemTypeId: 't-1',
  itemKey: 'boots',
  size: '40',
  mode: 'lent',
  signature: { state: 'signed', strokes: [[[10, 20]]] },
  statementLanguage: 'ar',
};
const saved = { deliveryId: handover.id, unitCode: 'B-0001', stockAfter: 3 };

describe('handover outbox', () => {
  test('keeps a handover until the server has it', async () => {
    const outbox = createHandoverOutbox(new MemoryStorage(), 'staff-1');
    outbox.enqueue(handover);

    const offline = await outbox.drain(() => Promise.reject(new Error('Network request failed')));
    expect(offline.failed).toBe(1);
    expect(outbox.list()).toHaveLength(1);

    const later = new Date(Date.now() + 60_000);
    const online = await outbox.drain(() => Promise.resolve(saved), later);
    expect(online.delivered).toEqual([saved]);
    expect(outbox.list()).toHaveLength(0);
  });

  test('a refusal stays, marked, so the card can say so', async () => {
    const outbox = createHandoverOutbox(new MemoryStorage(), 'staff-1');
    outbox.enqueue(handover);

    await outbox.drain(() => Promise.reject(new AppError('VALIDATION-1')));

    expect(outbox.list()[0]?.rejection?.code).toBe('VALIDATION-1');
  });

  test('another staff member on the same phone does not send it', () => {
    const storage = new MemoryStorage();
    createHandoverOutbox(storage, 'staff-1').enqueue(handover);

    expect(createHandoverOutbox(storage, 'staff-2').list()).toHaveLength(0);
  });

  test('a stored entry without her signature or a reason is dropped on read', () => {
    const storage = new MemoryStorage();
    storage.set(
      'ramassa.handover-outbox.v1',
      JSON.stringify({
        version: 1,
        entries: [
          {
            ...handover,
            signature: { state: 'refused' },
            ownerId: 'staff-1',
            attemptCount: 0,
            retryAt: null,
          },
        ],
      }),
    );

    expect(createHandoverOutbox(storage, 'staff-1').list()).toHaveLength(0);
  });
});
