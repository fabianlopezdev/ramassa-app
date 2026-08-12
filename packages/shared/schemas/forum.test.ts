import { describe, expect, test } from 'bun:test';
import {
  FORUM_POST_MAX_LENGTH,
  FORUM_REPLY_MAX_LENGTH,
  forumPostInputSchema,
  forumReplyInputSchema,
} from './forum';

describe('forum writing contracts', () => {
  test('accepts trimmed plain text and an optional authenticated media object key', () => {
    expect(
      forumPostInputSchema.parse({
        categoryId: '5eed0000-0000-4000-8006-000000000001',
        content: '  Busco una habitació  ',
        imageObjectKey: '5eed/org/forum/user/2026/08/photo.jpg',
      }),
    ).toEqual({
      categoryId: '5eed0000-0000-4000-8006-000000000001',
      content: 'Busco una habitació',
      imageObjectKey: '5eed/org/forum/user/2026/08/photo.jpg',
    });
  });

  test('rejects blank, over-limit, or URL-shaped image input', () => {
    expect(
      forumPostInputSchema.safeParse({
        categoryId: '5eed0000-0000-4000-8006-000000000001',
        content: '   ',
      }).success,
    ).toBe(false);
    expect(
      forumPostInputSchema.safeParse({
        categoryId: '5eed0000-0000-4000-8006-000000000001',
        content: 'x'.repeat(FORUM_POST_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      forumPostInputSchema.safeParse({
        categoryId: '5eed0000-0000-4000-8006-000000000001',
        content: 'Text',
        imageObjectKey: 'https://attacker.test/image.jpg',
      }).success,
    ).toBe(false);
  });

  test('keeps mixed Arabic and Latin reply text unchanged', () => {
    const content = 'أبحث عن feina a Barcelona <script>alert(1)</script>';
    expect(
      forumReplyInputSchema.parse({
        postId: '5eed0000-0000-4000-8006-000000000011',
        content,
      }),
    ).toEqual({
      postId: '5eed0000-0000-4000-8006-000000000011',
      content,
    });
    expect(
      forumReplyInputSchema.safeParse({
        postId: '5eed0000-0000-4000-8006-000000000011',
        content: 'x'.repeat(FORUM_REPLY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
