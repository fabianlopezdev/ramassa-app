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
      imageFocus: null,
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
      parentReplyId: null,
    });
    expect(
      forumReplyInputSchema.safeParse({
        postId: '5eed0000-0000-4000-8006-000000000011',
        content: 'x'.repeat(FORUM_REPLY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  test('an answer to an answer names its parent, and only by id (RAPP-884)', () => {
    const postId = '5eed0000-0000-4000-8006-000000000011';
    const parentReplyId = '5eed0000-0000-4000-8010-000000000011';
    expect(forumReplyInputSchema.parse({ postId, content: 'Hola', parentReplyId })).toEqual({
      postId,
      content: 'Hola',
      parentReplyId,
    });
    expect(
      forumReplyInputSchema.parse({ postId, content: 'Hola', parentReplyId: null }).parentReplyId,
    ).toBeNull();
    expect(
      forumReplyInputSchema.safeParse({ postId, content: 'Hola', parentReplyId: 'not-an-id' })
        .success,
    ).toBe(false);
  });
});
