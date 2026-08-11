import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchConversation,
  fetchConversationMessages,
  fetchConversationPeer,
  fetchUnreadMessageCount,
  getOrCreateOwnConversation,
  markConversationRead,
  mergeMessageTimeline,
  sendConversationMessage,
  subscribeToConversationMessages,
  subscribeToMessageActivity,
  type ChatMessage,
  type Conversation,
  type ConversationPeer,
} from '@ramassa/shared/messaging';
import { supabase } from './supabase';

function messageId(): string {
  return crypto.randomUUID();
}

export function useUnreadMessageCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (user === null) return;
    let active = true;
    const refresh = () => {
      void fetchUnreadMessageCount(supabase).then((value) => {
        if (active) setCount(value);
      });
    };
    refresh();
    const unsubscribe = subscribeToMessageActivity(supabase, user.id, refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);
  return count;
}

export function useWebConversation(conversationId?: string) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [peer, setPeer] = useState<ConversationPeer | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    if (user === null) return;
    setState('loading');
    try {
      const nextConversation =
        conversationId === undefined
          ? await getOrCreateOwnConversation(supabase)
          : await fetchConversation(supabase, conversationId);
      const [nextMessages, nextPeer] = await Promise.all([
        fetchConversationMessages(supabase, nextConversation.id),
        fetchConversationPeer(supabase, nextConversation.userId),
      ]);
      setConversation(nextConversation);
      setMessages(nextMessages);
      setPeer(nextPeer);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [conversationId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (conversation === null) return;
    return subscribeToConversationMessages(supabase, conversation.id, (message) => {
      setMessages((current) => mergeMessageTimeline(current, [message]));
    });
  }, [conversation]);

  const latestId = messages.at(-1)?.id;
  useEffect(() => {
    if (conversation === null || latestId === undefined) return;
    void markConversationRead(supabase, conversation.id, latestId);
  }, [conversation, latestId]);

  const send = useCallback(
    async (rawContent: string) => {
      if (conversation === null || user === null) return;
      const content = rawContent.trim();
      if (content.length === 0 || content.length > 4_000) return;
      const optimistic: ChatMessage = {
        id: messageId(),
        conversationId: conversation.id,
        senderId: user.id,
        content,
        imageUrl: null,
        createdAt: new Date().toISOString(),
        deliveryState: 'sending',
      };
      setMessages((current) => mergeMessageTimeline(current, [optimistic]));
      try {
        const delivered = await sendConversationMessage(supabase, {
          id: optimistic.id,
          conversationId: conversation.id,
          content,
        });
        setMessages((current) => mergeMessageTimeline(current, [delivered]));
      } catch {
        setMessages((current) =>
          current.map((message) =>
            message.id === optimistic.id ? { ...message, deliveryState: 'retrying' } : message,
          ),
        );
      }
    },
    [conversation, user],
  );

  return { conversation, peer, messages, state, load, send, userId: user?.id ?? null };
}
