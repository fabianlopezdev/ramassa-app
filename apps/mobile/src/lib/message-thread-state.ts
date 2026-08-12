import type { ChatMessage, ConversationPeer } from '@ramassa/shared/messaging';
import type { NetworkStateLike } from './network-status';

export { latestDeliveredMessageId, syncReadReceiptWithRetry } from '@ramassa/shared/messaging';

export function groupDeliveredMessagesByConversation(
  messages: readonly ChatMessage[],
): ReadonlyMap<string, readonly ChatMessage[]> {
  const grouped = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    const current = grouped.get(message.conversationId);
    if (current === undefined) grouped.set(message.conversationId, [message]);
    else current.push(message);
  }
  return grouped;
}

export async function retryConversationQueries(
  conversationId: string | null,
  retryConversation: () => Promise<{ readonly data?: { readonly id: string } | undefined }>,
  retryMessages: (conversationId: string) => Promise<unknown>,
  retryPeer?: () => Promise<unknown>,
): Promise<void> {
  const result = await retryConversation();
  const refreshedConversationId = result.data?.id ?? conversationId;
  if (refreshedConversationId === null) return;
  await retryMessages(refreshedConversationId);
  await retryPeer?.();
}

export function messageListKeyboardDismissMode(
  platform: string | undefined,
): 'interactive' | 'on-drag' {
  return platform === 'ios' ? 'interactive' : 'on-drag';
}

export function shouldDrainMessagingOutbox(state: NetworkStateLike): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function resolveConversationId(
  serverConversationId: string | null,
  requestedConversationId: string | null,
  pendingConversationIds: readonly string[],
): string | null {
  return serverConversationId ?? requestedConversationId ?? pendingConversationIds[0] ?? null;
}

export function shouldRenderRestoredConversation(
  state: NetworkStateLike,
  pendingMessageCount: number,
): boolean {
  const isExplicitlyOffline = state.isConnected === false || state.isInternetReachable === false;
  return isExplicitlyOffline && pendingMessageCount > 0;
}

export function staffConversationTitle(peer: ConversationPeer | null, fallback: string): string {
  return peer === null ? fallback : `${peer.firstName} ${peer.lastName}`;
}
