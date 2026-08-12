import { describe, expect, test } from 'bun:test';
import {
  createForumPost,
  createForumReply,
  deleteOwnForumPost,
  editOwnForumPost,
  fetchForumPosts,
  filterForumPostsByCategory,
  parseForumPlainText,
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
});
