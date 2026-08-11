import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  fetchConversationMessages,
  fetchUnreadMessageCount,
  getOrCreateOwnConversation,
  markConversationRead,
  mergeMessageTimeline,
  sendConversationMessage,
  subscribeToConversationMessages,
  subscribeToMessageActivity,
  type ChatMessage,
  type Conversation,
} from '@ramassa/shared/messaging';
import { createMessagingOutbox } from '@ramassa/shared/messaging/outbox';
import { generateMessageId } from './message-id';
import { isNetworkStateOnline } from './network-status';
import { mmkvStorage } from './storage';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';
export const conversationQueryKey = (userId: string) =>
  ['messaging', userId, 'conversation'] as const;
export const messagesQueryKey = (userId: string, conversationId: string) =>
  ['messaging', userId, 'messages', conversationId] as const;
export const unreadMessagesQueryKey = (userId: string) => ['messaging', userId, 'unread'] as const;

export function useUnreadMessages() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const key = useMemo(() => unreadMessagesQueryKey(userId ?? SIGNED_OUT), [userId]);
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchUnreadMessageCount(supabase),
    enabled: userId !== null,
  });
  useEffect(() => {
    if (userId === null) return;
    return subscribeToMessageActivity(supabase, userId, () => {
      void queryClient.invalidateQueries({ queryKey: key });
    });
  }, [key, queryClient, userId]);
  return query;
}

export function useOwnConversation() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const network = useNetworkState();
  const isOnline = isNetworkStateOnline(network);
  const conversationKey = useMemo(() => conversationQueryKey(userId ?? SIGNED_OUT), [userId]);
  const conversationQuery = useQuery<Conversation>({
    queryKey: conversationKey,
    queryFn: () => getOrCreateOwnConversation(supabase),
    enabled: userId !== null,
  });
  const conversationId = conversationQuery.data?.id ?? null;
  const messageKey = useMemo(
    () => messagesQueryKey(userId ?? SIGNED_OUT, conversationId ?? 'pending'),
    [conversationId, userId],
  );
  const messagesQuery = useQuery<readonly ChatMessage[]>({
    queryKey: messageKey,
    queryFn: ({ signal }) => fetchConversationMessages(supabase, conversationId!, signal),
    enabled: userId !== null && conversationId !== null,
  });
  const outbox = useMemo(
    () => (userId === null ? null : createMessagingOutbox(mmkvStorage, userId)),
    [userId],
  );
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);

  const drain = useCallback(async () => {
    if (!isOnline || outbox === null) return;
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
      queryClient.setQueryData<readonly ChatMessage[]>(messageKey, (current) =>
        mergeMessageTimeline(current ?? [], result.delivered),
      );
    }
    setNextRetryAt(result.nextRetryAt);
  }, [isOnline, messageKey, outbox, queryClient]);

  useEffect(() => {
    if (isOnline) void drain();
  }, [drain, isOnline]);
  useEffect(() => {
    if (!isOnline || nextRetryAt === null) return;
    const timer = setTimeout(() => void drain(), Math.max(0, Date.parse(nextRetryAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [drain, isOnline, nextRetryAt]);

  useEffect(() => {
    if (conversationId === null || userId === null) return;
    return subscribeToConversationMessages(supabase, conversationId, (message) => {
      queryClient.setQueryData<readonly ChatMessage[]>(messageKey, (current) =>
        mergeMessageTimeline(current ?? [], [message]),
      );
      void queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(userId) });
    });
  }, [conversationId, messageKey, queryClient, userId]);

  const pendingMessages =
    outbox === null || userId === null || conversationId === null
      ? []
      : outbox
          .list()
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
  const latestId = messages.at(-1)?.id ?? null;
  useEffect(() => {
    if (conversationId === null || latestId === null || userId === null) return;
    void markConversationRead(supabase, conversationId, latestId).then(() =>
      queryClient.setQueryData(unreadMessagesQueryKey(userId), 0),
    );
  }, [conversationId, latestId, queryClient, userId]);

  const send = useCallback(
    (rawContent: string) => {
      if (conversationId === null || userId === null || outbox === null) return;
      const content = rawContent.trim();
      if (content.length === 0 || content.length > 4_000) return;
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
      if (isOnline) void drain();
    },
    [conversationId, drain, isOnline, messageKey, outbox, queryClient, userId],
  );

  return {
    conversation: conversationQuery.data,
    messages,
    send,
    isOnline,
    isPending: conversationQuery.isPending || messagesQuery.isPending,
    isError: conversationQuery.isError || messagesQuery.isError,
    refetch: async () => {
      await conversationQuery.refetch();
      await messagesQuery.refetch();
    },
  };
}
