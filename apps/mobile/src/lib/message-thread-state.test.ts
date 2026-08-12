import { describe, expect, test } from 'bun:test';
import type { ChatMessage, ConversationPeer } from '@ramassa/shared/messaging';
import {
  groupDeliveredMessagesByConversation,
  latestDeliveredMessageId,
  messageListKeyboardDismissMode,
  resolveConversationId,
  retryConversationQueries,
  shouldDrainMessagingOutbox,
  shouldRenderRestoredConversation,
  staffConversationTitle,
  syncReadReceiptWithRetry,
} from './message-thread-state';

const delivered: ChatMessage = {
  id: 'a4900000-0000-4000-8000-000000000001',
  conversationId: 'a4900000-0000-4000-8000-000000000002',
  senderId: 'a4900000-0000-4000-8000-000000000003',
  content: 'Delivered',
  imageUrl: null,
  createdAt: '2026-08-11T16:30:00.000Z',
  deliveryState: 'delivered',
};

describe('native message thread state', () => {
  test('marks read only through the newest server-delivered message', () => {
    const optimistic: ChatMessage = {
      ...delivered,
      id: 'a4900000-0000-4000-8000-000000000004',
      content: 'Still queued',
      createdAt: '2026-08-11T16:31:00.000Z',
      deliveryState: 'sending',
    };

    expect(latestDeliveredMessageId([delivered, optimistic])).toBe(delivered.id);
    expect(latestDeliveredMessageId([optimistic])).toBeNull();
  });

  test('keeps owner-wide outbox deliveries scoped to their conversation caches', () => {
    const otherConversation = {
      ...delivered,
      id: 'a4900000-0000-4000-8000-000000000004',
      conversationId: 'a4900000-0000-4000-8000-000000000005',
    };

    expect(
      [...groupDeliveredMessagesByConversation([delivered, otherConversation])].map(
        ([conversationId, messages]) => [conversationId, messages.map((message) => message.id)],
      ),
    ).toEqual([
      [delivered.conversationId, [delivered.id]],
      [otherConversation.conversationId, [otherConversation.id]],
    ]);
  });

  test('uses the freshly returned id to recover messages after an initial conversation failure', async () => {
    const calls: string[] = [];

    await retryConversationQueries(
      null,
      async () => {
        calls.push('conversation');
        return { data: { id: delivered.conversationId } };
      },
      async (conversationId) => {
        calls.push(`messages:${conversationId}`);
      },
    );

    expect(calls).toEqual(['conversation', `messages:${delivered.conversationId}`]);
  });

  test('retries both established conversation queries', async () => {
    const calls: string[] = [];

    await retryConversationQueries(
      delivered.conversationId,
      async () => {
        calls.push('conversation');
        return { data: undefined };
      },
      async (conversationId) => {
        calls.push(`messages:${conversationId}`);
      },
    );

    expect(calls).toEqual(['conversation', `messages:${delivered.conversationId}`]);
  });

  test('uses native drag dismissal behavior on both platforms', () => {
    expect(messageListKeyboardDismissMode('ios')).toBe('interactive');
    expect(messageListKeyboardDismissMode('android')).toBe('on-drag');
  });

  test('does not drain a restored outbox until connectivity is explicit', () => {
    expect(shouldDrainMessagingOutbox({})).toBe(false);
    expect(shouldDrainMessagingOutbox({ isConnected: false })).toBe(false);
    expect(shouldDrainMessagingOutbox({ isConnected: true, isInternetReachable: false })).toBe(
      false,
    );
    expect(shouldDrainMessagingOutbox({ isConnected: true })).toBe(true);
  });

  test('restores an offline conversation from its persisted outbox after a process restart', () => {
    expect(resolveConversationId(null, null, [delivered.conversationId])).toBe(
      delivered.conversationId,
    );
    expect(shouldRenderRestoredConversation({ isConnected: false }, 1)).toBe(true);
    expect(shouldRenderRestoredConversation({ isConnected: true }, 1)).toBe(false);
    expect(shouldRenderRestoredConversation({ isConnected: false }, 0)).toBe(false);
  });

  test('shows participant identity in staff threads', () => {
    const peer: ConversationPeer = {
      id: 'a4900000-0000-4000-8000-000000000005',
      firstName: 'Amina',
      lastName: 'Al-Hassan',
      role: 'player',
      city: 'Granollers',
      preferredLanguage: 'ar',
    };

    expect(staffConversationTitle(peer, 'Messages')).toBe('Amina Al-Hassan');
    expect(staffConversationTitle(null, 'Messages')).toBe('Messages');
  });

  test('retries a transient read receipt once and then succeeds', async () => {
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

  test('does not retry or report an aborted read receipt', async () => {
    let attempts = 0;
    const controller = new AbortController();
    controller.abort();

    const synced = await syncReadReceiptWithRetry(
      async () => {
        attempts += 1;
        throw new Error('aborted');
      },
      controller.signal,
      async () => undefined,
    );

    expect(synced).toBe(false);
    expect(attempts).toBe(0);
  });
});
