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

  test('does not send newer messages ahead of a failed earlier message', async () => {
    const outbox = createMessagingOutbox(memoryStorage(), 'player-1');
    outbox.enqueue({
      id: 'a4700000-0000-4000-8001-000000000001',
      conversationId: 'conversation-1',
      content: 'first',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    outbox.enqueue({
      id: 'a4700000-0000-4000-8001-000000000002',
      conversationId: 'conversation-1',
      content: 'second',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:01.000Z',
    });
    const attempted: string[] = [];

    const result = await outbox.drain(async (entry) => {
      attempted.push(entry.content ?? '');
      if (entry.content === 'first') throw new Error('offline');
      return entry.content;
    }, new Date('2026-08-10T12:00:10.000Z'));

    expect(attempted).toEqual(['first']);
    expect(result.failed).toBe(1);
    expect(outbox.list().map((entry) => entry.content)).toEqual(['first', 'second']);

    attempted.length = 0;
    await outbox.drain(async (entry) => {
      attempted.push(entry.content ?? '');
      return entry.content;
    }, new Date('2026-08-10T12:00:10.500Z'));
    expect(attempted).toEqual([]);
  });

  test('discards malformed persisted entries without losing valid queued messages', () => {
    const storage = memoryStorage();
    storage.set(
      'ramassa.messaging-outbox.v1',
      JSON.stringify({
        version: 1,
        entries: [
          {
            id: 'a4700000-0000-4000-8001-000000000001',
            conversationId: 'conversation-1',
            ownerId: 'player-1',
            content: 'valid',
            imageUrl: null,
            createdAt: '2026-08-10T12:00:00.000Z',
            attemptCount: 0,
            retryAt: null,
          },
          { ownerId: 'player-1', content: 'malformed' },
        ],
      }),
    );

    expect(
      createMessagingOutbox(storage, 'player-1')
        .list()
        .map((entry) => entry.content),
    ).toEqual(['valid']);
  });

  test('deduplicates ids only within the same owner', () => {
    const storage = memoryStorage();
    const firstOwner = createMessagingOutbox(storage, 'player-1');
    const secondOwner = createMessagingOutbox(storage, 'player-2');
    const sharedId = 'a4700000-0000-4000-8001-000000000001';

    firstOwner.enqueue({
      id: sharedId,
      conversationId: 'conversation-1',
      content: 'first owner',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    secondOwner.enqueue({
      id: sharedId,
      conversationId: 'conversation-2',
      content: 'second owner',
      imageUrl: null,
      createdAt: '2026-08-10T12:00:01.000Z',
    });

    expect(firstOwner.list().map((entry) => entry.content)).toEqual(['first owner']);
    expect(secondOwner.list().map((entry) => entry.content)).toEqual(['second owner']);
  });
});
