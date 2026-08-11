import { describe, expect, test } from 'bun:test';
import { formatUnreadBadge, unreadBadgeProps } from './unread-badge';

describe('unread message badge', () => {
  test('does not render a zero badge', () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(unreadBadgeProps(0)).toEqual({ hidden: true, children: undefined });
  });

  test('renders positive counts and caps the visible value', () => {
    expect(formatUnreadBadge(1)).toBe('1');
    expect(formatUnreadBadge(42)).toBe('42');
    expect(formatUnreadBadge(120)).toBe('99');
    expect(unreadBadgeProps(1)).toEqual({ hidden: false, children: '1' });
  });
});
