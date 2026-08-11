import type { RealtimePostgresInsertPayload, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import { buildPrefixTsQuery } from '../participants/participant-query';
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
  readonly city: string | null;
  readonly preferredLanguage: string;
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

export interface StaffConversationRow {
  readonly conversationId: string;
  readonly participantId: string;
  readonly participantFirstName: string;
  readonly participantLastName: string;
  readonly participantRole: 'player' | 'entity';
  readonly participantCity: string | null;
  readonly participantLanguage: string;
  readonly assignedStaffId: string | null;
  readonly assignedStaffFirstName: string | null;
  readonly assignedStaffLastName: string | null;
  readonly unreadCount: number;
  readonly latestMessageAt: string | null;
  readonly latestMessagePreview: string | null;
  readonly latestSenderId: string | null;
  readonly conversationCreatedAt: string;
}

export interface ConversationStaffMember {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: 'staff' | 'admin';
}

export interface ConversationAssignmentHistoryEntry {
  readonly id: string;
  readonly changedBy: string;
  readonly previousStaffId: string | null;
  readonly assignedStaffId: string | null;
  readonly createdAt: string;
}

const urlBoolean = z
  .preprocess((value) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false' || value === undefined) return false;
    return value;
  }, z.boolean())
  .catch(false)
  .default(false);

export const adminConversationSearchSchema = z.object({
  q: z.string().trim().max(200).catch('').default(''),
  unread: urlBoolean,
  assigned: urlBoolean,
  participant: z.enum(['all', 'player', 'entity']).catch('all').default('all'),
});

export type AdminConversationSearch = z.infer<typeof adminConversationSearchSchema>;

export function parseAdminConversationSearch(
  search: Record<string, unknown>,
): AdminConversationSearch {
  return adminConversationSearchSchema.parse(search);
}

export const buildConversationPrefixTsQuery = buildPrefixTsQuery;

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
  city: z.string().nullable(),
  preferred_language: z.string(),
});

const staffConversationRowSchema = z.object({
  conversation_id: z.uuid(),
  participant_id: z.uuid(),
  participant_first_name: z.string(),
  participant_last_name: z.string(),
  participant_role: z.enum(['player', 'entity']),
  participant_city: z.string().nullable(),
  participant_language: z.string(),
  assigned_staff_id: z.uuid().nullable(),
  assigned_staff_first_name: z.string().nullable(),
  assigned_staff_last_name: z.string().nullable(),
  unread_count: z.coerce.number().int().nonnegative(),
  latest_message_at: z.string().nullable(),
  latest_message_preview: z.string().nullable(),
  latest_sender_id: z.uuid().nullable(),
  conversation_created_at: z.string(),
});

const conversationStaffRowSchema = z.object({
  id: z.uuid(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.enum(['staff', 'admin']),
});

const assignmentHistoryRowSchema = z.object({
  id: z.uuid(),
  changed_by: z.uuid(),
  previous_staff_id: z.uuid().nullable(),
  assigned_staff_id: z.uuid().nullable(),
  created_at: z.string(),
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

function parseStaffConversation(raw: unknown): StaffConversationRow {
  const row = staffConversationRowSchema.parse(raw);
  return {
    conversationId: row.conversation_id,
    participantId: row.participant_id,
    participantFirstName: row.participant_first_name,
    participantLastName: row.participant_last_name,
    participantRole: row.participant_role,
    participantCity: row.participant_city,
    participantLanguage: row.participant_language,
    assignedStaffId: row.assigned_staff_id,
    assignedStaffFirstName: row.assigned_staff_first_name,
    assignedStaffLastName: row.assigned_staff_last_name,
    unreadCount: row.unread_count,
    latestMessageAt: row.latest_message_at,
    latestMessagePreview: row.latest_message_preview,
    latestSenderId: row.latest_sender_id,
    conversationCreatedAt: row.conversation_created_at,
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
    .select('id, first_name, last_name, role, city, preferred_language')
    .eq('id', userId)
    .in('role', ['player', 'entity']);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query.single();
  if (error) throw new AppError('DB-1', { message: error.message });
  const row = peerRowSchema.parse(data);
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    city: row.city,
    preferredLanguage: row.preferred_language,
  };
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

export async function fetchStaffConversations(
  client: Client,
  rawSearch: AdminConversationSearch,
  signal?: AbortSignal,
): Promise<readonly StaffConversationRow[]> {
  const search = adminConversationSearchSchema.parse(rawSearch);
  let query = client.rpc('list_staff_conversations', {
    p_assigned_to_me: search.assigned,
    p_participant_role: search.participant,
    p_query: search.q,
    p_unread_only: search.unread,
  });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []).map(parseStaffConversation);
}

export async function fetchConversationStaff(
  client: Client,
  signal?: AbortSignal,
): Promise<readonly ConversationStaffMember[]> {
  let query = client
    .from('profiles')
    .select('id, first_name, last_name, role')
    .in('role', ['staff', 'admin'])
    .eq('is_active', true)
    .order('first_name', { ascending: true })
    .order('last_name', { ascending: true });
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []).map((raw) => {
    const row = conversationStaffRowSchema.parse(raw);
    return { id: row.id, firstName: row.first_name, lastName: row.last_name, role: row.role };
  });
}

export async function fetchConversationAssignmentHistory(
  client: Client,
  rawConversationId: string,
  signal?: AbortSignal,
): Promise<readonly ConversationAssignmentHistoryEntry[]> {
  const conversationId = z.uuid().parse(rawConversationId);
  let query = client
    .from('conversation_assignment_history')
    .select('id, changed_by, previous_staff_id, assigned_staff_id, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new AppError('DB-1', { message: error.message });
  return (data ?? []).map((raw) => {
    const row = assignmentHistoryRowSchema.parse(raw);
    return {
      id: row.id,
      changedBy: row.changed_by,
      previousStaffId: row.previous_staff_id,
      assignedStaffId: row.assigned_staff_id,
      createdAt: row.created_at,
    };
  });
}

export async function setConversationAssignment(
  client: Client,
  rawConversationId: string,
  rawStaffId: string | null,
): Promise<void> {
  const conversationId = z.uuid().parse(rawConversationId);
  const staffId = rawStaffId === null ? null : z.uuid().parse(rawStaffId);
  const { error } = await client.rpc('set_conversation_assignment', {
    p_conversation_id: conversationId,
    p_staff_id: staffId as string,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
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

export function subscribeToConversationQueue(
  client: Client,
  ownerId: string,
  onChange: () => void,
): () => void {
  const channel = client
    .channel(`conversation-queue:${z.uuid().parse(ownerId)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, onChange)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_read_states' },
      onChange,
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
