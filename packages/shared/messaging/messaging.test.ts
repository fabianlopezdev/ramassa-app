import { describe, expect, test } from 'bun:test';
import { mergeMessageTimeline, messageInputSchema, type ChatMessage } from './messaging';

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
});
