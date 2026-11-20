import { describe, expect, test } from 'bun:test';
import type { ForumReplyRow } from '@ramassa/shared/forum';
import { buildReplyThread, threadRows } from './forum-reply-thread';

const POST_ID = '5eed0000-0000-4000-8010-000000000001';

function reply(
  id: string,
  createdAt: string,
  parentReplyId: string | null = null,
  overrides: Partial<ForumReplyRow> = {},
): ForumReplyRow {
  return {
    id,
    org_id: '5eed0000-0000-4000-8000-000000000000',
    post_id: POST_ID,
    parent_reply_id: parentReplyId,
    author_id: '5eed0000-0000-4000-8000-000000000012',
    author_first_name: 'Fatima',
    content: `Answer ${id}`,
    visibility: 'visible',
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

const ids = (thread: ReturnType<typeof buildReplyThread>) =>
  thread.map((entry) => [entry.reply.id, entry.children.map((child) => child.id)]);

describe('buildReplyThread (RAPP-884)', () => {
  test('an empty list is an empty thread', () => {
    expect(buildReplyThread([])).toEqual([]);
  });

  test('answers to the post come in time order, each with its answers in time order', () => {
    const rows = [
      reply('b-child-2', '2026-11-20T10:05:00Z', 'b'),
      reply('a', '2026-11-20T09:00:00Z'),
      reply('b', '2026-11-20T09:30:00Z'),
      reply('b-child-1', '2026-11-20T10:00:00Z', 'b'),
      reply('a-child', '2026-11-20T11:00:00Z', 'a'),
    ];
    expect(ids(buildReplyThread(rows))).toEqual([
      ['a', ['a-child']],
      ['b', ['b-child-1', 'b-child-2']],
    ]);
  });

  test('answers written at the same moment keep a stable order by id', () => {
    const rows = [
      reply('z', '2026-11-20T09:00:00Z'),
      reply('m', '2026-11-20T09:00:00Z'),
      reply('m-2', '2026-11-20T09:10:00Z', 'm'),
      reply('m-1', '2026-11-20T09:10:00Z', 'm'),
    ];
    expect(ids(buildReplyThread(rows))).toEqual([
      ['m', ['m-1', 'm-2']],
      ['z', []],
    ]);
  });

  test('an answer whose parent is not in the list is left out', () => {
    const rows = [
      reply('a', '2026-11-20T09:00:00Z'),
      reply('orphan', '2026-11-20T09:30:00Z', 'hidden-from-her'),
    ];
    expect(ids(buildReplyThread(rows))).toEqual([['a', []]]);
  });

  test('a deleted parent stays as a tombstone and keeps its answers', () => {
    const rows = [
      reply('a', '2026-11-20T09:00:00Z', null, { visibility: 'deleted', content: null }),
      reply('a-child', '2026-11-20T09:30:00Z', 'a'),
    ];
    const thread = buildReplyThread(rows);
    expect(ids(thread)).toEqual([['a', ['a-child']]]);
    expect(thread[0]!.reply.visibility).toBe('deleted');
  });

  test('an answer under an answer to an answer is left out, so the thread stays two levels', () => {
    const rows = [
      reply('a', '2026-11-20T09:00:00Z'),
      reply('a-child', '2026-11-20T09:10:00Z', 'a'),
      reply('a-grandchild', '2026-11-20T09:20:00Z', 'a-child'),
    ];
    expect(ids(buildReplyThread(rows))).toEqual([['a', ['a-child']]]);
  });
});

const rowShape = (rows: ReturnType<typeof threadRows>) =>
  rows.map((row) => [row.reply.id, row.level, row.rails, row.hasAnswersBelow, row.answersTo]);

describe('threadRows (RAPP-884)', () => {
  test('no answers, no rows', () => {
    expect(threadRows([])).toEqual([]);
  });

  test('each answer is one row: a branch off the line above it, or the corner where that line ends', () => {
    const thread = buildReplyThread([
      reply('a', '2026-11-20T09:00:00Z', null, { author_first_name: 'Amina' }),
      reply('a-1', '2026-11-20T09:10:00Z', 'a'),
      reply('a-2', '2026-11-20T09:20:00Z', 'a'),
      reply('b', '2026-11-20T09:30:00Z', null, { author_first_name: 'Laia' }),
      reply('b-1', '2026-11-20T09:40:00Z', 'b'),
    ]);
    expect(rowShape(threadRows(thread))).toEqual([
      ['a', 1, ['branch'], true, null],
      ['a-1', 2, ['through', 'branch'], false, 'Amina'],
      ['a-2', 2, ['through', 'corner'], false, 'Amina'],
      ['b', 1, ['corner'], true, null],
      ['b-1', 2, ['none', 'corner'], false, 'Laia'],
    ]);
  });

  test('the last answer to the post ends the post line in a corner into its avatar', () => {
    const thread = buildReplyThread([
      reply('a', '2026-11-20T09:00:00Z'),
      reply('b', '2026-11-20T09:30:00Z'),
    ]);
    expect(rowShape(threadRows(thread))).toEqual([
      ['a', 1, ['branch'], false, null],
      ['b', 1, ['corner'], false, null],
    ]);
  });
});
