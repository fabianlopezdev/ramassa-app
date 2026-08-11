export const staffConversationListQueryKey = (userId: string) =>
  ['messaging', 'staff', userId, 'conversations'] as const;

export const staffConversationQueryKey = (userId: string, conversationId: string) =>
  ['messaging', 'staff', userId, conversationId] as const;
