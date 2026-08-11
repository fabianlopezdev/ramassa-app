import { describe, expect, test } from 'bun:test';
import { staffConversationListQueryKey, staffConversationQueryKey } from './staff-messaging-keys';

describe('mobile staff conversation cache identity', () => {
  test('the list is scoped to the signed-in staff identity', () => {
    expect(staffConversationListQueryKey('staff-a')).toEqual([
      'messaging',
      'staff',
      'staff-a',
      'conversations',
    ]);
  });

  test('a thread is scoped to both staff and conversation', () => {
    expect(staffConversationQueryKey('staff-a', 'conversation-a')).toEqual([
      'messaging',
      'staff',
      'staff-a',
      'conversation-a',
    ]);
    expect(staffConversationQueryKey('staff-b', 'conversation-a')).not.toEqual(
      staffConversationQueryKey('staff-a', 'conversation-a'),
    );
  });
});
