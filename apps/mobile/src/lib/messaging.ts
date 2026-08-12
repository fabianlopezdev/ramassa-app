import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { AppError, toAppError } from '@ramassa/shared/errors';
import {
  fetchConversation,
  fetchConversationMessages,
  fetchConversationPeer,
  fetchStaffConversations,
  fetchUnreadMessageCount,
  getOrCreateOwnConversation,
  markConversationRead,
  mergeMessageTimeline,
  MESSAGE_CONTENT_MAX_LENGTH,
  sendConversationMessage,
  subscribeToConversationMessages,
  subscribeToConversationQueue,
  subscribeToMessageActivity,
  type ChatMessage,
  type Conversation,
  type ConversationPeer,
  type StaffConversationRow,
} from '@ramassa/shared/messaging';
import { createMessagingOutbox } from '@ramassa/shared/messaging/outbox';
import { generateMessageId } from './message-id';
import {
  groupDeliveredMessagesByConversation,
  latestDeliveredMessageId,
  resolveConversationId,
  retryConversationQueries,
  shouldDrainMessagingOutbox,
  shouldRenderRestoredConversation,
  syncReadReceiptWithRetry,
} from './message-thread-state';
import { isNetworkStateOnline } from './network-status';
import { safeAsync } from './observability';
import { staffConversationListQueryKey, staffConversationQueryKey } from './staff-messaging-keys';
import { privateStorage } from './storage';
import { supabase } from './supabase';

export { staffConversationListQueryKey, staffConversationQueryKey } from './staff-messaging-keys';

const SIGNED_OUT = 'signed-out';
export const conversationQueryKey = (userId: string) =>
  ['messaging', userId, 'conversation'] as const;
export const messagesQueryKey = (userId: string, conversationId: string) =>
  ['messaging', userId, 'messages', conversationId] as const;
export const conversationPeerQueryKey = (userId: string, peerId: string) =>
  ['messaging', userId, 'peer', peerId] as const;
export const unreadMessagesQueryKey = (userId: string) => ['messaging', userId, 'unread'] as const;

export function useUnreadMessages() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const key = useMemo(() => unreadMessagesQueryKey(userId ?? SIGNED_OUT), [userId]);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchUnreadMessageCount(supabase, null, signal),
    enabled: userId !== null,
  });
  useEffect(() => {
    if (userId === null) return;
    return subscribeToMessageActivity(
      supabase,
      userId,
      () => {
        void queryClient.invalidateQueries({ queryKey: key });
      },
      (status) => {
        if (status === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: key });
      },
    );
  }, [key, queryClient, userId]);
  return query;
}

function useConversationThread(requestedConversationId: string | null) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const network = useNetworkState();
  const isOnline = isNetworkStateOnline(network);
  const canDrainOutbox = shouldDrainMessagingOutbox(network);
  const conversationKey = useMemo(
    () =>
      requestedConversationId === null
        ? conversationQueryKey(userId ?? SIGNED_OUT)
        : staffConversationQueryKey(userId ?? SIGNED_OUT, requestedConversationId),
    [requestedConversationId, userId],
  );
  const outbox = useMemo(
    () => (userId === null ? null : createMessagingOutbox(privateStorage, userId)),
    [userId],
  );
  const outboxEntries = outbox?.list() ?? [];
  const conversationQuery = useQuery<Conversation>({
    queryKey: conversationKey,
    queryFn: ({ signal }) =>
      requestedConversationId === null
        ? getOrCreateOwnConversation(supabase, signal)
        : fetchConversation(supabase, requestedConversationId, signal),
    enabled: userId !== null,
  });
  const conversationId = resolveConversationId(
    conversationQuery.data?.id ?? null,
    requestedConversationId,
    outboxEntries.map((entry) => entry.conversationId),
  );
  const peerId = requestedConversationId === null ? null : (conversationQuery.data?.userId ?? null);
  const peerQuery = useQuery<ConversationPeer>({
    queryKey: conversationPeerQueryKey(userId ?? SIGNED_OUT, peerId ?? 'pending'),
    queryFn: ({ signal }) => fetchConversationPeer(supabase, peerId!, signal),
    enabled: userId !== null && peerId !== null,
  });
  const messageKey = useMemo(
    () => messagesQueryKey(userId ?? SIGNED_OUT, conversationId ?? 'pending'),
    [conversationId, userId],
  );
  const messagesQuery = useQuery<readonly ChatMessage[]>({
    queryKey: messageKey,
    queryFn: ({ signal }) => fetchConversationMessages(supabase, conversationId!, signal),
    enabled: userId !== null && conversationId !== null,
  });
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);

  const drain = useCallback(async () => {
    if (!canDrainOutbox || outbox === null || userId === null) return;
    const result = await outbox.drain((entry) => {
      if (entry.content === null) {
        throw new AppError('VALIDATION-1', { message: 'Text message required' });
      }
      return sendConversationMessage(supabase, {
        id: entry.id,
        conversationId: entry.conversationId,
        content: entry.content,
      });
    });
    if (result.delivered.length > 0) {
      for (const [deliveredConversationId, delivered] of groupDeliveredMessagesByConversation(
        result.delivered,
      )) {
        queryClient.setQueryData<readonly ChatMessage[]>(
          messagesQueryKey(userId, deliveredConversationId),
          (current) => mergeMessageTimeline(current ?? [], delivered),
        );
      }
    }
    setNextRetryAt(result.nextRetryAt);
  }, [canDrainOutbox, outbox, queryClient, userId]);

  useEffect(() => {
    if (canDrainOutbox) void drain();
  }, [canDrainOutbox, drain]);
  useEffect(() => {
    if (!canDrainOutbox || nextRetryAt === null) return;
    const timer = setTimeout(() => void drain(), Math.max(0, Date.parse(nextRetryAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [canDrainOutbox, drain, nextRetryAt]);

  useEffect(() => {
    if (conversationId === null || userId === null) return;
    return subscribeToConversationMessages(
      supabase,
      conversationId,
      (message) => {
        queryClient.setQueryData<readonly ChatMessage[]>(messageKey, (current) =>
          mergeMessageTimeline(current ?? [], [message]),
        );
        void queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(userId) });
      },
      (status) => {
        if (status === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: messageKey });
      },
    );
  }, [conversationId, messageKey, queryClient, userId]);

  const pendingMessages =
    outbox === null || userId === null || conversationId === null
      ? []
      : outboxEntries
          .filter((entry) => entry.conversationId === conversationId)
          .map<ChatMessage>((entry) => ({
            id: entry.id,
            conversationId: entry.conversationId,
            senderId: userId,
            content: entry.content,
            imageUrl: entry.imageUrl,
            createdAt: entry.createdAt,
            deliveryState: entry.attemptCount > 0 ? 'retrying' : 'sending',
          }));
  const messages = mergeMessageTimeline(messagesQuery.data ?? [], pendingMessages);
  const rendersRestoredConversation = shouldRenderRestoredConversation(
    network,
    pendingMessages.length,
  );
  const threadError = conversationQuery.error ?? messagesQuery.error ?? peerQuery.error;
  const latestId = latestDeliveredMessageId(messages);
  useEffect(() => {
    if (!canDrainOutbox || conversationId === null || latestId === null || userId === null) return;
    const controller = new AbortController();
    void safeAsync(
      () =>
        syncReadReceiptWithRetry(
          () => markConversationRead(supabase, conversationId, latestId, controller.signal),
          controller.signal,
        ),
      {
        code: 'DB-1',
        context: { operation: 'messaging.mark-conversation-read' },
      },
    ).then((result) => {
      if (result.ok && result.value && !controller.signal.aborted) {
        if (requestedConversationId === null) {
          queryClient.setQueryData(unreadMessagesQueryKey(userId), 0);
        } else {
          void queryClient.invalidateQueries({ queryKey: staffConversationListQueryKey(userId) });
          void queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(userId) });
        }
      }
    });
    return () => controller.abort();
  }, [canDrainOutbox, conversationId, latestId, queryClient, requestedConversationId, userId]);

  const send = useCallback(
    (rawContent: string) => {
      if (conversationId === null || userId === null || outbox === null) return;
      const content = rawContent.trim();
      if (content.length === 0 || content.length > MESSAGE_CONTENT_MAX_LENGTH) return;
      const createdAt = new Date().toISOString();
      const id = generateMessageId();
      outbox.enqueue({ id, conversationId, content, imageUrl: null, createdAt });
      queryClient.setQueryData<readonly ChatMessage[]>(messageKey, (current) =>
        mergeMessageTimeline(current ?? [], [
          {
            id,
            conversationId,
            senderId: userId,
            content,
            imageUrl: null,
            createdAt,
            deliveryState: 'sending',
          },
        ]),
      );
      if (canDrainOutbox) void drain();
    },
    [canDrainOutbox, conversationId, drain, messageKey, outbox, queryClient, userId],
  );

  return {
    conversation: conversationQuery.data,
    peer: peerQuery.data ?? null,
    messages,
    send,
    isOnline,
    isPending:
      !rendersRestoredConversation &&
      (conversationQuery.isPending ||
        messagesQuery.isPending ||
        (requestedConversationId !== null && peerQuery.isPending)),
    isError:
      !rendersRestoredConversation &&
      (conversationQuery.isError || messagesQuery.isError || peerQuery.isError),
    errorCode: threadError === null ? null : toAppError(threadError).code,
    isRefetching:
      conversationQuery.isRefetching || messagesQuery.isRefetching || peerQuery.isRefetching,
    refetch: () =>
      retryConversationQueries(
        conversationId,
        conversationQuery.refetch,
        (refreshedConversationId) =>
          queryClient.fetchQuery({
            queryKey: messagesQueryKey(userId ?? SIGNED_OUT, refreshedConversationId),
            queryFn: ({ signal }) =>
              fetchConversationMessages(supabase, refreshedConversationId, signal),
          }),
        requestedConversationId === null ? undefined : peerQuery.refetch,
      ),
  };
}

export function useOwnConversation() {
  return useConversationThread(null);
}

export function useStaffConversation(conversationId: string) {
  return useConversationThread(conversationId);
}

export function useStaffConversationList() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const key = useMemo(() => staffConversationListQueryKey(userId ?? SIGNED_OUT), [userId]);
  const query = useQuery<readonly StaffConversationRow[]>({
    queryKey: key,
    queryFn: ({ signal }) =>
      fetchStaffConversations(
        supabase,
        { q: '', unread: false, assigned: false, participant: 'all' },
        signal,
      ),
    enabled: userId !== null,
  });
  useEffect(() => {
    if (userId === null) return;
    return subscribeToConversationQueue(
      supabase,
      userId,
      () => {
        void queryClient.invalidateQueries({ queryKey: key });
      },
      (status) => {
        if (status === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: key });
      },
    );
  }, [key, queryClient, userId]);
  return query;
}
