import { describe, expect, test } from 'bun:test';
import {
  adminConversationSearchSchema,
  buildConversationPrefixTsQuery,
  mergeMessageTimeline,
  messageInputSchema,
  parseAdminConversationSearch,
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
