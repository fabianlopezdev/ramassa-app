import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  fetchConversation,
  fetchConversationMessages,
  fetchConversationPeer,
  fetchUnreadMessageCount,
  getOrCreateOwnConversation,
  latestDeliveredMessageId,
  markConversationRead,
  mergeMessageTimeline,
  MESSAGE_CONTENT_MAX_LENGTH,
  sendConversationMessage,
  subscribeToConversationMessages,
  subscribeToMessageActivity,
  syncReadReceiptWithRetry,
  type ChatMessage,
  type Conversation,
  type ConversationPeer,
} from '@ramassa/shared/messaging';
import { safeAsync } from './observability';
import { supabase } from './supabase';

function messageId(): string {
  return crypto.randomUUID();
}

export type WebMessageSendAttempt =
  | { readonly status: 'delivered'; readonly message: ChatMessage }
  | { readonly status: 'failed'; readonly errorCode: AppErrorCode };

export async function attemptWebMessageSend(
  optimistic: ChatMessage,
  send: (message: ChatMessage) => Promise<ChatMessage>,
): Promise<WebMessageSendAttempt> {
  try {
    return { status: 'delivered', message: await send(optimistic) };
  } catch (error) {
    return { status: 'failed', errorCode: toAppError(error).code };
  }
}

export function isCurrentWebConversationRequest(
  requestId: number,
  latestRequestId: number,
  signal: AbortSignal,
): boolean {
  return requestId === latestRequestId && !signal.aborted;
}

export function useUnreadMessageCount() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (userId === null) {
      setCount(0);
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      void fetchUnreadMessageCount(supabase, null, requestController.signal)
        .then((value) => {
          if (active && !requestController.signal.aborted) setCount(value);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeToMessageActivity(supabase, userId, refresh, (status) => {
      if (status === 'SUBSCRIBED') refresh();
    });
    return () => {
      active = false;
      controller?.abort();
      unsubscribe();
    };
  }, [userId]);
  return count;
}

export function useWebConversation(conversationId?: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [peer, setPeer] = useState<ConversationPeer | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [loadErrorCode, setLoadErrorCode] = useState<AppErrorCode | null>(null);
  const [sendErrorCode, setSendErrorCode] = useState<AppErrorCode | null>(null);
  const [readSyncEpoch, setReadSyncEpoch] = useState(0);
  const latestLoadRequestId = useRef(0);
  const activeLoadController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const requestId = latestLoadRequestId.current + 1;
    latestLoadRequestId.current = requestId;
    activeLoadController.current?.abort();
    const controller = new AbortController();
    activeLoadController.current = controller;
    setConversation(null);
    setPeer(null);
    setMessages([]);
    setSendState('idle');
    setLoadErrorCode(null);
    setSendErrorCode(null);
    setState('loading');
    if (userId === null) return;
    try {
      const nextConversation =
        conversationId === undefined
          ? await getOrCreateOwnConversation(supabase, controller.signal)
          : await fetchConversation(supabase, conversationId, controller.signal);
      const [nextMessages, nextPeer] = await Promise.all([
        fetchConversationMessages(supabase, nextConversation.id, controller.signal),
        fetchConversationPeer(supabase, nextConversation.userId, controller.signal),
      ]);
      if (
        !isCurrentWebConversationRequest(requestId, latestLoadRequestId.current, controller.signal)
      ) {
        return;
      }
      setConversation(nextConversation);
      setMessages(nextMessages);
      setPeer(nextPeer);
      setState('ready');
    } catch (error) {
      if (
        isCurrentWebConversationRequest(requestId, latestLoadRequestId.current, controller.signal)
      ) {
        setLoadErrorCode(toAppError(error).code);
        setState('error');
      }
    } finally {
      if (activeLoadController.current === controller) activeLoadController.current = null;
    }
  }, [conversationId, userId]);

  useEffect(() => {
    void load();
    return () => {
      latestLoadRequestId.current += 1;
      activeLoadController.current?.abort();
    };
  }, [load]);

  const loadedConversationId = conversation?.id ?? null;
  useEffect(() => {
    if (loadedConversationId === null) return;
    const controller = new AbortController();
    let active = true;
    const unsubscribe = subscribeToConversationMessages(
      supabase,
      loadedConversationId,
      (message) => {
        if (active) setMessages((current) => mergeMessageTimeline(current, [message]));
      },
      (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (active) setReadSyncEpoch((current) => current + 1);
        void fetchConversationMessages(supabase, loadedConversationId, controller.signal)
          .then((caughtUpMessages) => {
            if (active) {
              setMessages((current) => mergeMessageTimeline(current, caughtUpMessages));
            }
          })
          .catch(() => undefined);
      },
    );
    return () => {
      active = false;
      controller.abort();
      unsubscribe();
    };
  }, [loadedConversationId]);

  const latestId = latestDeliveredMessageId(messages);
  useEffect(() => {
    if (loadedConversationId === null || latestId === null) return;
    const controller = new AbortController();
    void safeAsync(
      () =>
        syncReadReceiptWithRetry(
          () => markConversationRead(supabase, loadedConversationId, latestId, controller.signal),
          controller.signal,
        ),
      {
        code: 'DB-1',
        context: { operation: 'messaging.mark-conversation-read' },
      },
    );
    return () => controller.abort();
  }, [latestId, loadedConversationId, readSyncEpoch]);

  const send = useCallback(
    async (rawContent: string) => {
      if (loadedConversationId === null || userId === null) return;
      const content = rawContent.trim();
      if (content.length === 0 || content.length > MESSAGE_CONTENT_MAX_LENGTH) return;
      const optimistic: ChatMessage = {
        id: messageId(),
        conversationId: loadedConversationId,
        senderId: userId,
        content,
        imageUrl: null,
        createdAt: new Date().toISOString(),
        deliveryState: 'sending',
      };
      const requestId = latestLoadRequestId.current;
      setSendState('sending');
      setSendErrorCode(null);
      setMessages((current) => mergeMessageTimeline(current, [optimistic]));
      const attempt = await attemptWebMessageSend(optimistic, (message) =>
        sendConversationMessage(supabase, {
          id: message.id,
          conversationId: message.conversationId,
          content: message.content ?? '',
        }),
      );
      if (requestId !== latestLoadRequestId.current) return false;
      if (attempt.status === 'delivered') {
        setMessages((current) => mergeMessageTimeline(current, [attempt.message]));
        setSendState('idle');
        return true;
      }
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setSendErrorCode(attempt.errorCode);
      setSendState('error');
      return false;
    },
    [loadedConversationId, userId],
  );

  return {
    conversation,
    peer,
    messages,
    state,
    sendState,
    loadErrorCode,
    sendErrorCode,
    load,
    send,
    userId,
  };
}
