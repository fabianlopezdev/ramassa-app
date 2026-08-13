import { describe, expect, test } from 'bun:test';
import {
  contactForumAuthor,
  createForumPost,
  createForumReply,
  deleteOwnForumPost,
  editOwnForumPost,
  fetchForumModerationQueue,
  fetchForumPosts,
  filterForumPostsByCategory,
  flagForumContent,
  moderateForumTarget,
  parseForumPlainText,
  setForumPostCategory,
  setForumPostingDisabled,
  setForumPostPinned,
  type ForumPostRow,
} from './forum';

const post = (id: string, categoryId: string): ForumPostRow => ({
  id,
  org_id: '5eed0000-0000-4000-8000-000000000000',
  category_id: categoryId,
  author_id: '5eed0000-0000-4000-8000-000000000011',
  author_first_name: 'Amina',
  content: 'Text',
  image_url: null,
  visibility: 'visible',
  is_pinned: false,
  reply_count: 0,
  created_at: '2026-08-12T10:00:00.000Z',
  updated_at: '2026-08-12T10:00:00.000Z',
});

describe('forum plain-text rendering', () => {
  test('keeps markup and script injection as inert text', () => {
    expect(
      parseForumPlainText('<script>alert(1)</script> **bold** [x](javascript:alert(1))'),
    ).toEqual([
      {
        kind: 'text',
        value: '<script>alert(1)</script> **bold** [x](javascript:alert(1))',
      },
    ]);
  });

  test('linkifies only explicit http and https links without swallowing punctuation', () => {
    expect(
      parseForumPlainText(
        'Mira https://ramassa.org/ajuda, no javascript:alert(1) ni data:text/html,x.',
      ),
    ).toEqual([
      { kind: 'text', value: 'Mira ' },
      { kind: 'link', value: 'https://ramassa.org/ajuda' },
      { kind: 'text', value: ', no javascript:alert(1) ni data:text/html,x.' },
    ]);
  });

  test('preserves mixed-direction Arabic and Latin content byte for byte', () => {
    const content = 'فرصة feina a Barcelona: https://example.org/jobs';
    expect(
      parseForumPlainText(content)
        .map((segment) => segment.value)
        .join(''),
    ).toBe(content);
  });
});

describe('forum category board', () => {
  test('parses a media moderation row with no post or category', async () => {
    const client = {
      async rpc() {
        return {
          data: [
            {
              target_type: 'media',
              target_id: '5eed0000-0000-4000-8014-000000000098',
              post_id: null,
              author_id: '5eed0000-0000-4000-8000-000000000011',
              author_first_name: 'Amina',
              content: 'RAPP-52 gallery moderation QA',
              visibility: 'hidden_pending_review',
              is_pinned: false,
              category_id: null,
              flag_count: 3,
              first_flagged_at: '2026-08-12T20:00:00.000Z',
              reasons: ['privacy'],
              comments: [],
              media_file_url:
                '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/33333333333333333333333333333333.jpg',
              media_thumbnail_url:
                '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/33333333333333333333333333333333.jpg',
              media_file_type: 'image',
            },
          ],
          error: null,
        };
      },
    };

    await expect(fetchForumModerationQueue(client as never)).resolves.toMatchObject([
      { target_type: 'media', post_id: null, category_id: null },
    ]);
  });

  test('filters persisted posts by category without changing server order', () => {
    const rows = [post('pinned', 'jobs'), post('newest', 'housing'), post('older', 'jobs')];
    expect(filterForumPostsByCategory(rows, 'jobs').map((row) => row.id)).toEqual([
      'pinned',
      'older',
    ]);
    expect(filterForumPostsByCategory(rows, null)).toEqual(rows);
  });

  test('loads visible posts in pinned-first stable order with cancellation', async () => {
    const calls: unknown[] = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value]);
        return this;
      },
      order(column: string, options: unknown) {
        calls.push(['order', column, options]);
        return this;
      },
      abortSignal(signal: AbortSignal) {
        calls.push(['abortSignal', signal]);
        return this;
      },
      then(resolve: (value: unknown) => void) {
        resolve({
          data: [
            post('5eed0000-0000-4000-8010-000000000001', '5eed0000-0000-4000-8006-000000000002'),
          ],
          error: null,
        });
      },
    };
    const client = {
      from(table: string) {
        calls.push(['from', table]);
        return {
          select(columns: string) {
            calls.push(['select', columns]);
            return query;
          },
        };
      },
    };
    const signal = new AbortController().signal;
    await expect(fetchForumPosts(client as never, { signal })).resolves.toHaveLength(1);
    expect(calls).toEqual([
      ['from', 'forum_posts'],
      ['select', expect.stringContaining('author_first_name')],
      ['eq', 'visibility', 'visible'],
      ['order', 'is_pinned', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['abortSignal', signal],
    ]);
  });

  test('writes only through the forum RPC ownership boundaries', async () => {
    const calls: unknown[] = [];
    const client = {
      async rpc(name: string, args: unknown) {
        calls.push([name, args]);
        return {
          data: name.startsWith('create') ? '5eed0000-0000-4000-8010-000000000099' : null,
          error: null,
        };
      },
    };
    const postId = await createForumPost(client as never, {
      categoryId: '5eed0000-0000-4000-8006-000000000002',
      content: '  Busco feina  ',
      imageObjectKey: null,
    });
    await createForumReply(client as never, { postId, content: '  Jo en conec una  ' });
    await editOwnForumPost(client as never, { postId, content: '  Busco feina a Vic  ' });
    await deleteOwnForumPost(client as never, postId);
    expect(calls).toEqual([
      [
        'create_forum_post',
        {
          p_category_id: '5eed0000-0000-4000-8006-000000000002',
          p_content: 'Busco feina',
          p_image_url: null,
        },
      ],
      ['create_forum_reply', { p_post_id: postId, p_content: 'Jo en conec una' }],
      ['edit_own_forum_post', { p_post_id: postId, p_content: 'Busco feina a Vic' }],
      ['delete_own_forum_post', { p_post_id: postId }],
    ]);
  });

  test('flags and moderation actions use validated server boundaries', async () => {
    const calls: unknown[] = [];
    const client = {
      async rpc(name: string, args: unknown) {
        calls.push([name, args]);
        return {
          data:
            name === 'flag_forum_content'
              ? '5eed0000-0000-4000-8012-000000000099'
              : name === 'get_or_create_staff_conversation'
                ? '5eed0000-0000-4000-8011-000000000099'
                : null,
          error: null,
        };
      },
    };
    const targetId = '5eed0000-0000-4000-8010-000000000001';
    const categoryId = '5eed0000-0000-4000-8006-000000000003';
    const participantId = '5eed0000-0000-4000-8000-000000000011';

    await flagForumContent(client as never, {
      targetType: 'post',
      targetId,
      reason: 'harassment',
      comment: '  Em fa sentir insegura  ',
    });
    await moderateForumTarget(client as never, {
      targetType: 'post',
      targetId,
      action: 'dismiss',
    });
    await setForumPostPinned(client as never, targetId, true);
    await setForumPostCategory(client as never, targetId, categoryId);
    await setForumPostingDisabled(client as never, participantId, true);
    await expect(contactForumAuthor(client as never, participantId)).resolves.toBe(
      '5eed0000-0000-4000-8011-000000000099',
    );

    expect(calls).toEqual([
      [
        'flag_forum_content',
        {
          p_target_type: 'post',
          p_target_id: targetId,
          p_reason: 'harassment',
          p_comment: 'Em fa sentir insegura',
        },
      ],
      [
        'moderate_forum_target',
        { p_target_type: 'post', p_target_id: targetId, p_action: 'dismiss' },
      ],
      ['set_forum_post_pinned', { p_post_id: targetId, p_is_pinned: true }],
      ['set_forum_post_category', { p_post_id: targetId, p_category_id: categoryId }],
      ['set_forum_posting_disabled', { p_participant_id: participantId, p_disabled: true }],
      ['get_or_create_staff_conversation', { p_participant_id: participantId }],
    ]);
  });
});
