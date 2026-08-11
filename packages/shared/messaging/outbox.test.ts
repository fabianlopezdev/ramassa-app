import { describe, expect, test } from 'bun:test';
import { createMessagingOutbox, type MessagingOutboxStorage } from './outbox';

function memoryStorage(): MessagingOutboxStorage {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('persisted messaging outbox', () => {
  test('rapid sends survive reconstruction in their original order', () => {
    const storage = memoryStorage();
    const beforeRestart = createMessagingOutbox(storage, 'player-1');
    beforeRestart.enqueue({
      id: 'a4700000-0000-4000-8001-000000000001',
      conversationId: 'conversation-1',
      content: 'first',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    beforeRestart.enqueue({
      id: 'a4700000-0000-4000-8001-000000000002',
      conversationId: 'conversation-1',
      content: 'second',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:00.001Z',
    });

    const afterRestart = createMessagingOutbox(storage, 'player-1');
    expect(afterRestart.list().map((entry) => entry.content)).toEqual(['first', 'second']);
  });

  test('listing works on Hermes without Array.prototype.toSorted', () => {
    const outbox = createMessagingOutbox(memoryStorage(), 'player-1');
    outbox.enqueue({
      id: 'a4700000-0000-4000-8001-000000000001',
      conversationId: 'conversation-1',
      content: 'compatible',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    const original = Array.prototype.toSorted;
    Object.defineProperty(Array.prototype, 'toSorted', { value: undefined, configurable: true });
    try {
      expect(outbox.list()).toHaveLength(1);
    } finally {
      Object.defineProperty(Array.prototype, 'toSorted', { value: original, configurable: true });
    }
  });

  test('a failed send stays queued and retries after its persisted backoff', async () => {
    const outbox = createMessagingOutbox(memoryStorage(), 'player-1');
    outbox.enqueue({
      id: 'a4700000-0000-4000-8001-000000000001',
      conversationId: 'conversation-1',
      content: 'retry',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    let attempts = 0;
    const send = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return 'delivered';
    };

    const failed = await outbox.drain(send, new Date('2026-08-10T12:00:10.000Z'));
    expect(failed).toEqual({
      delivered: [],
      failed: 1,
      nextRetryAt: '2026-08-10T12:00:11.000Z',
    });
    expect(outbox.list()[0]).toMatchObject({
      attemptCount: 1,
      retryAt: '2026-08-10T12:00:11.000Z',
    });

    const tooEarly = await outbox.drain(send, new Date('2026-08-10T12:00:10.500Z'));
    expect(tooEarly.nextRetryAt).toBe('2026-08-10T12:00:11.000Z');
    expect(attempts).toBe(1);

    const retried = await outbox.drain(send, new Date('2026-08-10T12:00:11.000Z'));
    expect(retried).toEqual({ delivered: ['delivered'], failed: 0, nextRetryAt: null });
    expect(outbox.list()).toEqual([]);
  });

  test('concurrent drains send each queued message once', async () => {
    const outbox = createMessagingOutbox(memoryStorage(), 'player-1');
    outbox.enqueue({
      id: 'a4700000-0000-4000-8001-000000000001',
      conversationId: 'conversation-1',
      content: 'once',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    let sends = 0;
    const send = async () => {
      sends += 1;
      return 'delivered';
    };
    await Promise.all([outbox.drain(send), outbox.drain(send)]);
    expect(sends).toBe(1);
  });
});
