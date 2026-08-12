import { z } from 'zod';

export const FORUM_POST_MAX_LENGTH = 2_000;
export const FORUM_REPLY_MAX_LENGTH = 1_000;

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
