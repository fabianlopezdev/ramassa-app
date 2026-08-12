import { describe, expect, test } from 'bun:test';
import {
  adminConversationSearchSchema,
  buildConversationPrefixTsQuery,
  fetchConversationMessages,
  getOrCreateOwnConversation,
  latestDeliveredMessageId,
  mergeMessageTimeline,
  messageInputSchema,
  parseAdminConversationSearch,
  subscribeToConversationQueue,
  subscribeToMessageActivity,
  syncReadReceiptWithRetry,
  type ChatMessage,
} from './messaging';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'a4700000-0000-4000-8001-000000000001',
    conversationId: 'a4700000-0000-4000-8000-000000000001',
    senderId: 'a4700000-0000-4000-8000-000000000011',
    content: 'rapp47-test-message',
    imageUrl: null,
    createdAt: '2026-08-10T12:00:00.000Z',
    deliveryState: 'delivered',
    ...overrides,
  };
}

describe('message timeline merge', () => {
  test('a Realtime echo replaces the optimistic row without a duplicate', () => {
    const optimistic = message({ deliveryState: 'sending' });
    const realtime = message({ deliveryState: 'delivered' });

    expect(mergeMessageTimeline([optimistic], [realtime])).toEqual([realtime]);
  });

  test('rapid sends with the same timestamp keep a deterministic order', () => {
    const second = message({ id: 'a4700000-0000-4000-8001-000000000002' });
    const first = message({ id: 'a4700000-0000-4000-8001-000000000001' });
    expect(mergeMessageTimeline([second], [first]).map((row) => row.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  test('merging works on Hermes without Array.prototype.toSorted', () => {
    const original = Array.prototype.toSorted;
    Object.defineProperty(Array.prototype, 'toSorted', { value: undefined, configurable: true });
    try {
      expect(mergeMessageTimeline([], [message()])).toHaveLength(1);
    } finally {
      Object.defineProperty(Array.prototype, 'toSorted', { value: original, configurable: true });
    }
  });

  test('text is trimmed and capped at 4000 characters', () => {
    const base = {
      id: 'a4700000-0000-4000-8001-000000000001',
      conversationId: 'a4700000-0000-4000-8000-000000000001',
    };
    expect(messageInputSchema.parse({ ...base, content: ' hello ' }).content).toBe('hello');
    expect(messageInputSchema.safeParse({ ...base, content: 'x'.repeat(4_001) }).success).toBe(
      false,
    );
  });

  test('loads the newest 500 messages and returns them in chronological order', async () => {
    const orderCalls: { readonly column: string; readonly ascending: boolean }[] = [];
    const newest = {
      id: 'a4700000-0000-4000-8001-000000000002',
      conversation_id: 'a4700000-0000-4000-8000-000000000001',
      sender_id: 'a4700000-0000-4000-8000-000000000011',
      content: 'newest',
      image_url: null,
      created_at: '2026-08-10T12:00:01.000Z',
    };
    const oldestInWindow = {
      ...newest,
      id: 'a4700000-0000-4000-8001-000000000001',
      content: 'oldest-in-window',
      created_at: '2026-08-10T12:00:00.000Z',
    };
    const query = {
      select: () => query,
      eq: () => query,
      order: (column: string, options: { readonly ascending: boolean }) => {
        orderCalls.push({ column, ascending: options.ascending });
        return query;
      },
      limit: async () => ({ data: [newest, oldestInWindow], error: null }),
    };
    const client = { from: () => query } as never;

    const result = await fetchConversationMessages(client, 'a4700000-0000-4000-8000-000000000001');

    expect(orderCalls).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]);
    expect(result.map((row) => row.id)).toEqual([oldestInWindow.id, newest.id]);
  });

  test('read receipts ignore a newer optimistic message id', () => {
    const delivered = message();
    const optimistic = message({
      id: 'a4700000-0000-4000-8001-000000000002',
      createdAt: '2026-08-10T12:00:01.000Z',
      deliveryState: 'sending',
    });

    expect(latestDeliveredMessageId([delivered, optimistic])).toBe(delivered.id);
    expect(latestDeliveredMessageId([optimistic])).toBeNull();
  });

  test('forwards cancellation to the own-conversation RPC', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const rpcResult = {
      abortSignal: async (signal: AbortSignal) => {
        receivedSignal = signal;
        return {
          data: {
            id: 'a4700000-0000-4000-8000-000000000001',
            org_id: 'a4700000-0000-4000-8000-000000000002',
            user_id: 'a4700000-0000-4000-8000-000000000003',
            assigned_staff_id: null,
            created_at: '2026-08-10T12:00:00.000Z',
          },
          error: null,
        };
      },
    };
    const client = { rpc: () => rpcResult } as never;

    await getOrCreateOwnConversation(client, controller.signal);

    expect(receivedSignal).toBe(controller.signal);
  });
});

describe('read receipt synchronization', () => {
  test('retries one transient failure before succeeding', async () => {
    let attempts = 0;
    const controller = new AbortController();

    const synced = await syncReadReceiptWithRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary');
      },
      controller.signal,
      async () => undefined,
    );

    expect(synced).toBe(true);
    expect(attempts).toBe(2);
  });
});

describe('admin conversation filters', () => {
  test('an empty URL means every conversation, unread first in the database', () => {
    expect(parseAdminConversationSearch({})).toEqual({
      q: '',
      unread: false,
      assigned: false,
      participant: 'all',
    });
  });

  test('reloadable URL values parse booleans and participant roles', () => {
    expect(
      parseAdminConversationSearch({
        q: '  أمينة  ',
        unread: 'true',
        assigned: 'true',
        participant: 'player',
      }),
    ).toEqual({ q: 'أمينة', unread: true, assigned: true, participant: 'player' });
  });

  test('hostile and stale URL filter values fall back without widening access', () => {
    expect(
      parseAdminConversationSearch({
        q: "x') | (1=1--",
        unread: 'yes',
        assigned: 'somebody-else',
        participant: 'staff',
      }),
    ).toEqual({
      q: "x') | (1=1--",
      unread: false,
      assigned: false,
      participant: 'all',
    });
    expect(adminConversationSearchSchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(true);
  });

  test('partial names, accents, Arabic and Cyrillic become safe prefix queries', () => {
    expect(buildConversationPrefixTsQuery('María')).toBe('María:*');
    expect(buildConversationPrefixTsQuery('أمي')).toBe('أمي:*');
    expect(buildConversationPrefixTsQuery('Окса')).toBe('Окса:*');
  });

  test('tsquery operators are removed rather than executed', () => {
    expect(buildConversationPrefixTsQuery("nuria') | (1=1--")).toBe('nuria:* & 11:*');
    expect(buildConversationPrefixTsQuery('<->')).toBe('');
  });
});

describe('message realtime subscriptions', () => {
  test('reports subscribed status so consumers can close the initial fetch gap', () => {
    const statuses: string[] = [];
    const channel = {
      on: () => channel,
      subscribe: (onStatus?: (status: string) => void) => {
        onStatus?.('SUBSCRIBED');
        return channel;
      },
    };
    const client = {
      channel: () => channel,
      removeChannel: () => undefined,
    } as never;
    const ownerId = 'a4700000-0000-4000-8000-000000000011';

    const unsubscribeActivity = subscribeToMessageActivity(
      client,
      ownerId,
      () => undefined,
      (status) => statuses.push(`activity:${status}`),
    );
    const unsubscribeQueue = subscribeToConversationQueue(
      client,
      ownerId,
      () => undefined,
      (status) => statuses.push(`queue:${status}`),
    );

    expect(statuses).toEqual(['activity:SUBSCRIBED', 'queue:SUBSCRIBED']);
    unsubscribeActivity();
    unsubscribeQueue();
  });
});
