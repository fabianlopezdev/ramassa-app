import { z } from 'zod';

export const FORUM_POST_MAX_LENGTH = 2_000;
export const FORUM_REPLY_MAX_LENGTH = 1_000;
export const FORUM_FLAG_COMMENT_MAX_LENGTH = 500;
export const FORUM_FLAG_REASONS = [
  'harassment',
  'hate',
  'violence',
  'sexual',
  'privacy',
  'spam',
  'other',
] as const;

export const forumFlagTargetTypeSchema = z.enum(['post', 'reply']);
export const forumFlagReasonSchema = z.enum(FORUM_FLAG_REASONS);

const forumText = (maximum: number) => z.string().trim().min(1).max(maximum);
const forumImageObjectKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(1_024)
  .regex(/^(?![a-z][a-z0-9+.-]*:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s]+$/i);

export const forumPostInputSchema = z.object({
  categoryId: z.uuid(),
  content: forumText(FORUM_POST_MAX_LENGTH),
  imageObjectKey: forumImageObjectKeySchema.nullish().transform((value) => value ?? null),
});
export type ForumPostInput = z.infer<typeof forumPostInputSchema>;

export const forumReplyInputSchema = z.object({
  postId: z.uuid(),
  content: forumText(FORUM_REPLY_MAX_LENGTH),
});
export type ForumReplyInput = z.infer<typeof forumReplyInputSchema>;

export const forumPostEditSchema = z.object({
  postId: z.uuid(),
  content: forumText(FORUM_POST_MAX_LENGTH),
});
export type ForumPostEdit = z.infer<typeof forumPostEditSchema>;

export const forumFlagInputSchema = z.object({
  targetType: forumFlagTargetTypeSchema,
  targetId: z.uuid(),
  reason: forumFlagReasonSchema,
  comment: z
    .string()
    .trim()
    .max(FORUM_FLAG_COMMENT_MAX_LENGTH)
    .nullish()
    .transform((value) => (value === undefined || value === '' ? null : value)),
});
export type ForumFlagInput = z.infer<typeof forumFlagInputSchema>;

export const forumModerationActionSchema = z.enum(['dismiss', 'hide', 'delete']);
export const forumModerationInputSchema = z.object({
  targetType: forumFlagTargetTypeSchema,
  targetId: z.uuid(),
  action: forumModerationActionSchema,
});
export type ForumModerationInput = z.infer<typeof forumModerationInputSchema>;
