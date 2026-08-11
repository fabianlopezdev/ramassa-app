import type { RealtimePostgresInsertPayload, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database } from '../types/database';

export type MessageDeliveryState = 'sending' | 'retrying' | 'delivered';

type Client = SupabaseClient<Database>;

export interface Conversation {
  readonly id: string;
  readonly orgId: string;
  readonly userId: string;
  readonly assignedStaffId: string | null;
  readonly createdAt: string;
}

export interface ConversationPeer {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: 'player' | 'entity';
}

export interface ChatMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string | null;
  readonly imageUrl: string | null;
  readonly createdAt: string;
  readonly deliveryState: MessageDeliveryState;
}

export const messageInputSchema = z.object({
  conversationId: z.uuid(),
  id: z.uuid(),
  content: z.string().trim().min(1).max(4_000),
});

export type MessageInput = z.infer<typeof messageInputSchema>;

const conversationRowSchema = z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  user_id: z.uuid(),
  assigned_staff_id: z.uuid().nullable(),
  created_at: z.string(),
});

const messageRowSchema = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  sender_id: z.uuid(),
  content: z.string().nullable(),
  image_url: z.string().nullable(),
  created_at: z.string(),
});

const peerRowSchema = z.object({
  id: z.uuid(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.enum(['player', 'entity']),
});

function parseConversation(raw: unknown): Conversation {
  const row = conversationRowSchema.parse(raw);
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    assignedStaffId: row.assigned_staff_id,
    createdAt: row.created_at,
  };
}

function parseMessage(raw: unknown): ChatMessage {
  const row = messageRowSchema.parse(raw);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    deliveryState: 'delivered',
  };
}

export function mergeMessageTimeline(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): readonly ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => {
    const createdOrder = left.createdAt.localeCompare(right.createdAt);
    return createdOrder === 0 ? left.id.localeCompare(right.id) : createdOrder;
  });
}

export async function getOrCreateOwnConversation(client: Client): Promise<Conversation> {
  const { data, error } = await client.rpc('get_or_create_own_conversation');
  if (error) throw new AppError('DB-1', { message: error.message });
  return parseConversation(data);
}

export async function fetchConversation(
  client: Client,
  rawConversationId: string,
  signal?: AbortSignal,
): Promise<Conversation> {
  const conversationId = z.uuid().parse(rawConversationId);
  let query = client
    .from('conversations')
    .select('id, org_id, user_id, assigned_staff_id, created_at')
    .eq('id', conversationId);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query.single();
  if (error) throw new AppError('DB-1', { message: error.message });
  return parseConversation(data);
}

export async function fetchConversationPeer(
  client: Client,
  rawUserId: string,
  signal?: AbortSignal,
): Promise<ConversationPeer> {
  const userId = z.uuid().parse(rawUserId);
  let query = client
    .from('profiles')
    .select('id, first_name, last_name, role')
    .eq('id', userId)
    .in('role', ['player', 'entity']);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query.single();
  if (error) throw new AppError('DB-1', { message: error.message });
  const row = peerRowSchema.parse(data);
  return { id: row.id, firstName: row.first_name, lastName: row.last_name, role: row.role };
}

export async function fetchConversationMessages(
  client: Client,
  rawConversationId: string,
  signal?: AbortSignal,
): Promise<readonly ChatMessage[]> {
  const conversationId = z.uuid().parse(rawConversationId);
  let query = client
    .from('messages')
    .select('id, conversation_id, sender_id, content, image_url, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(500);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []).map(parseMessage);
}

export async function sendConversationMessage(
  client: Client,
  rawInput: MessageInput,
): Promise<ChatMessage> {
  const input = messageInputSchema.parse(rawInput);
  const { data, error } = await client.rpc('send_message', {
    p_content: input.content,
    p_conversation_id: input.conversationId,
    p_image_url: '',
    p_message_id: input.id,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  return parseMessage(data);
}

export async function markConversationRead(
  client: Client,
  rawConversationId: string,
  rawMessageId: string,
): Promise<void> {
  const conversationId = z.uuid().parse(rawConversationId);
  const messageId = z.uuid().parse(rawMessageId);
  const { error } = await client.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

export async function fetchUnreadMessageCount(
  client: Client,
  conversationId: string | null = null,
): Promise<number> {
  const parsedConversationId = conversationId === null ? null : z.uuid().parse(conversationId);
  const { data, error } =
    parsedConversationId === null
      ? await client.rpc('get_unread_message_count')
      : await client.rpc('get_unread_message_count', {
          p_conversation_id: parsedConversationId,
        });
  if (error) throw new AppError('DB-1', { message: error.message });
  return z.coerce.number().int().nonnegative().parse(data);
}

export function subscribeToConversationMessages(
  client: Client,
  rawConversationId: string,
  onMessage: (message: ChatMessage) => void,
  onStatus?: (status: string) => void,
): () => void {
  const conversationId = z.uuid().parse(rawConversationId);
  const channel = client
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: RealtimePostgresInsertPayload<Database['public']['Tables']['messages']['Row']>) => {
        onMessage(parseMessage(payload.new));
      },
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    void client.removeChannel(channel);
  };
}

export function subscribeToMessageActivity(
  client: Client,
  ownerId: string,
  onMessage: (message: ChatMessage) => void,
): () => void {
  const channel = client
    .channel(`message-activity:${z.uuid().parse(ownerId)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload: RealtimePostgresInsertPayload<Database['public']['Tables']['messages']['Row']>) => {
        onMessage(parseMessage(payload.new));
      },
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
