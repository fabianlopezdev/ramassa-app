export function formatUnreadBadge(unread: number): string | null {
  return unread > 0 ? String(Math.min(unread, 99)) : null;
}

export function unreadBadgeProps(unread: number): {
  readonly hidden: boolean;
  readonly children: string | undefined;
} {
  const value = formatUnreadBadge(unread);
  return { hidden: value === null, children: value ?? undefined };
}
