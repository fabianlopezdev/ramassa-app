import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { LocalizedContent } from './i18n';
import {
  forumFlagInputSchema,
  forumModerationInputSchema,
  forumPostEditSchema,
  forumPostInputSchema,
  forumReplyInputSchema,
  languageCodeSchema,
  type ForumFlagInput,
  type ForumModerationInput,
  type ForumPostEdit,
  type ForumPostInput,
  type ForumReplyInput,
} from './schemas';
import type { Database } from './types/database';

export type {
  ForumFlagInput,
  ForumModerationInput,
  ForumPostEdit,
  ForumPostInput,
  ForumReplyInput,
} from './schemas';

export type ForumVisibility = 'visible' | 'hidden_pending_review' | 'hidden' | 'deleted';
export type ForumFlagTargetType = ForumFlagInput['targetType'];
export type ForumModerationAction = ForumModerationInput['action'];

export interface ForumCategoryRow {
  readonly id: string;
  readonly name: LocalizedContent;
  readonly slug: string;
  readonly icon: string;
  readonly color: string;
  readonly sort_order: number;
}

const forumCategoryInputSchema = z.object({
  id: z.uuid().nullable(),
  name: z.object({
    ca: z.string().trim().min(1),
    es: z.string().trim().min(1),
    en: z.string().trim().min(1),
    ar: z.string().trim().min(1),
    fa: z.string().trim().min(1),
  }),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  icon: z.string().trim().min(1).max(64),
  color: z.string().trim().min(1).max(64),
  sortOrder: z.number().int(),
});
export type ForumCategoryInput = z.infer<typeof forumCategoryInputSchema>;

export interface ForumPostRow {
  readonly id: string;
  readonly org_id: string;
  readonly category_id: string;
  readonly author_id: string;
  readonly author_first_name: string;
  readonly content: string | null;
  readonly image_url: string | null;
  readonly visibility: ForumVisibility;
  readonly is_pinned: boolean;
  readonly reply_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ForumReplyRow {
  readonly id: string;
  readonly org_id: string;
  readonly post_id: string;
  readonly author_id: string;
  readonly author_first_name: string;
  readonly content: string | null;
  readonly visibility: ForumVisibility;
  readonly created_at: string;
  readonly updated_at: string;
}

const forumVisibilitySchema = z.enum(['visible', 'hidden_pending_review', 'hidden', 'deleted']);
const forumCategoryDatabaseRowSchema = z.object({
  id: z.uuid(),
  name: z.record(languageCodeSchema, z.string().trim().min(1)),
  slug: z.string().min(1),
  icon: z.string().min(1),
  color: z.string().min(1),
  sort_order: z.number().int(),
});
const forumPostDatabaseRowSchema = z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  category_id: z.uuid(),
  author_id: z.uuid(),
  author_first_name: z.string().min(1),
  content: z.string().nullable(),
  image_url: z.string().nullable(),
  visibility: forumVisibilitySchema,
  is_pinned: z.boolean(),
  reply_count: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
const forumReplyDatabaseRowSchema = z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  post_id: z.uuid(),
  author_id: z.uuid(),
  author_first_name: z.string().min(1),
  content: z.string().nullable(),
  visibility: forumVisibilitySchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
const forumModerationQueueRowSchema = z.object({
  target_type: z.enum(['post', 'reply']),
  target_id: z.uuid(),
  post_id: z.uuid(),
  author_id: z.uuid(),
  author_first_name: z.string().min(1),
  content: z.string().nullable(),
  visibility: forumVisibilitySchema,
  is_pinned: z.boolean(),
  category_id: z.uuid(),
  flag_count: z.number().int().positive(),
  first_flagged_at: z.iso.datetime({ offset: true }),
  reasons: z.array(z.string()),
  comments: z.array(z.string()),
});

export type ForumModerationQueueRow = z.infer<typeof forumModerationQueueRowSchema>;

const FORUM_CATEGORY_COLUMNS = 'id, name, slug, icon, color, sort_order';
const FORUM_POST_COLUMNS =
  'id, org_id, category_id, author_id, author_first_name, content, image_url, visibility, is_pinned, reply_count, created_at, updated_at';
const FORUM_REPLY_COLUMNS =
  'id, org_id, post_id, author_id, author_first_name, content, visibility, created_at, updated_at';

export async function fetchForumCategories(
  client: SupabaseClient<Database>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<readonly ForumCategoryRow[]> {
  let query = client
    .from('forum_categories')
    .select(FORUM_CATEGORY_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return forumCategoryDatabaseRowSchema.array().parse(data ?? []);
}

export async function fetchForumPosts(
  client: SupabaseClient<Database>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<readonly ForumPostRow[]> {
  let query = client
    .from('forum_posts')
    .select(FORUM_POST_COLUMNS)
    .eq('visibility', 'visible')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return forumPostDatabaseRowSchema.array().parse(data ?? []);
}

export async function fetchForumPost(
  client: SupabaseClient<Database>,
  postId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<ForumPostRow> {
  let query = client
    .from('forum_posts')
    .select(FORUM_POST_COLUMNS)
    .eq('id', z.uuid().parse(postId));
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query.single();
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return forumPostDatabaseRowSchema.parse(data);
}

export async function fetchForumReplies(
  client: SupabaseClient<Database>,
  postId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<readonly ForumReplyRow[]> {
  let query = client
    .from('forum_replies')
    .select(FORUM_REPLY_COLUMNS)
    .eq('post_id', z.uuid().parse(postId))
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return forumReplyDatabaseRowSchema.array().parse(data ?? []);
}

async function callForumRpc(
  client: SupabaseClient<Database>,
  name:
    'create_forum_post' | 'create_forum_reply' | 'edit_own_forum_post' | 'delete_own_forum_post',
  args: Record<string, string | null>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args as never);
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return data;
}

async function callModerationRpc(
  client: SupabaseClient<Database>,
  name:
    | 'flag_forum_content'
    | 'moderate_forum_target'
    | 'set_forum_post_pinned'
    | 'set_forum_post_category'
    | 'set_forum_posting_disabled'
    | 'get_or_create_staff_conversation',
  args: Record<string, string | boolean | null>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args as never);
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return data;
}

export async function createForumPost(
  client: SupabaseClient<Database>,
  rawInput: ForumPostInput,
): Promise<string> {
  const input = forumPostInputSchema.parse(rawInput);
  return z.uuid().parse(
    await callForumRpc(client, 'create_forum_post', {
      p_category_id: input.categoryId,
      p_content: input.content,
      p_image_url: input.imageObjectKey,
    }),
  );
}

export async function createForumReply(
  client: SupabaseClient<Database>,
  rawInput: ForumReplyInput,
): Promise<string> {
  const input = forumReplyInputSchema.parse(rawInput);
  return z.uuid().parse(
    await callForumRpc(client, 'create_forum_reply', {
      p_post_id: input.postId,
      p_content: input.content,
    }),
  );
}

export async function editOwnForumPost(
  client: SupabaseClient<Database>,
  rawInput: ForumPostEdit,
): Promise<void> {
  const input = forumPostEditSchema.parse(rawInput);
  await callForumRpc(client, 'edit_own_forum_post', {
    p_post_id: input.postId,
    p_content: input.content,
  });
}

export async function deleteOwnForumPost(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<void> {
  await callForumRpc(client, 'delete_own_forum_post', { p_post_id: z.uuid().parse(postId) });
}

export async function flagForumContent(
  client: SupabaseClient<Database>,
  rawInput: ForumFlagInput,
): Promise<string> {
  const input = forumFlagInputSchema.parse(rawInput);
  return z.uuid().parse(
    await callModerationRpc(client, 'flag_forum_content', {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_reason: input.reason,
      p_comment: input.comment,
    }),
  );
}

export async function fetchForumModerationQueue(
  client: SupabaseClient<Database>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<readonly ForumModerationQueueRow[]> {
  let query = client.rpc('list_forum_moderation_queue');
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return forumModerationQueueRowSchema.array().parse(data ?? []);
}

export async function moderateForumTarget(
  client: SupabaseClient<Database>,
  rawInput: ForumModerationInput,
): Promise<void> {
  const input = forumModerationInputSchema.parse(rawInput);
  await callModerationRpc(client, 'moderate_forum_target', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_action: input.action,
  });
}

export async function setForumPostPinned(
  client: SupabaseClient<Database>,
  postId: string,
  isPinned: boolean,
): Promise<void> {
  await callModerationRpc(client, 'set_forum_post_pinned', {
    p_post_id: z.uuid().parse(postId),
    p_is_pinned: isPinned,
  });
}

export async function setForumPostCategory(
  client: SupabaseClient<Database>,
  postId: string,
  categoryId: string,
): Promise<void> {
  await callModerationRpc(client, 'set_forum_post_category', {
    p_post_id: z.uuid().parse(postId),
    p_category_id: z.uuid().parse(categoryId),
  });
}

export async function setForumPostingDisabled(
  client: SupabaseClient<Database>,
  participantId: string,
  disabled: boolean,
): Promise<void> {
  await callModerationRpc(client, 'set_forum_posting_disabled', {
    p_participant_id: z.uuid().parse(participantId),
    p_disabled: disabled,
  });
}

export async function contactForumAuthor(
  client: SupabaseClient<Database>,
  participantId: string,
): Promise<string> {
  return z.uuid().parse(
    await callModerationRpc(client, 'get_or_create_staff_conversation', {
      p_participant_id: z.uuid().parse(participantId),
    }),
  );
}

export async function saveForumCategory(
  client: SupabaseClient<Database>,
  rawInput: ForumCategoryInput,
): Promise<string> {
  const input = forumCategoryInputSchema.parse(rawInput);
  const { data, error } = await client.rpc('save_forum_category', {
    p_category_id: input.id,
    p_name: input.name,
    p_slug: input.slug,
    p_icon: input.icon,
    p_color: input.color,
    p_sort_order: input.sortOrder,
  } as never);
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return z.uuid().parse(data);
}

export async function deleteForumCategory(
  client: SupabaseClient<Database>,
  categoryId: string,
): Promise<void> {
  const { error } = await client.rpc('delete_forum_category', {
    p_category_id: z.uuid().parse(categoryId),
  } as never);
  if (error !== null) throw new AppError('DB-1', { message: error.message });
}

export async function fetchOwnForumPostingStatus(
  client: SupabaseClient<Database>,
  userId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<boolean> {
  let query = client.from('profiles').select('is_forum_banned').eq('id', z.uuid().parse(userId));
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query.single();
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return z.object({ is_forum_banned: z.boolean() }).parse(data).is_forum_banned;
}

export type ForumTextSegment = Readonly<{
  kind: 'text' | 'link';
  value: string;
}>;

const HTTP_LINK_PATTERN = /https?:\/\/[^\s<>]+/giu;
const TRAILING_LINK_PUNCTUATION = /[),.!?;:]+$/u;

export function parseForumPlainText(content: string): readonly ForumTextSegment[] {
  const segments: ForumTextSegment[] = [];
  let cursor = 0;
  const pushSegment = (segment: ForumTextSegment) => {
    const previous = segments.at(-1);
    if (segment.kind === 'text' && previous?.kind === 'text') {
      segments[segments.length - 1] = { kind: 'text', value: previous.value + segment.value };
      return;
    }
    segments.push(segment);
  };

  for (const match of content.matchAll(HTTP_LINK_PATTERN)) {
    const index = match.index;
    const candidate = match[0];
    if (index > cursor) pushSegment({ kind: 'text', value: content.slice(cursor, index) });

    const link = candidate.replace(TRAILING_LINK_PUNCTUATION, '');
    const trailing = candidate.slice(link.length);
    if (link.length > 0) pushSegment({ kind: 'link', value: link });
    if (trailing.length > 0) pushSegment({ kind: 'text', value: trailing });
    cursor = index + candidate.length;
  }

  if (cursor < content.length) pushSegment({ kind: 'text', value: content.slice(cursor) });
  return segments.length === 0 ? [{ kind: 'text', value: content }] : segments;
}

export function filterForumPostsByCategory(
  posts: readonly ForumPostRow[],
  categoryId: string | null,
): readonly ForumPostRow[] {
  return categoryId === null ? posts : posts.filter((post) => post.category_id === categoryId);
}
