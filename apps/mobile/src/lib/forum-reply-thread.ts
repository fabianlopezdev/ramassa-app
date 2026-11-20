import type { ForumReplyRow } from '@ramassa/shared/forum';

/** One answer to the post with the answers to it underneath (RAPP-884). */
export interface ForumReplyThreadEntry {
  readonly reply: ForumReplyRow;
  readonly children: readonly ForumReplyRow[];
}

function byCreatedAtThenId(left: ForumReplyRow, right: ForumReplyRow): number {
  const byTime = Date.parse(left.created_at) - Date.parse(right.created_at);
  if (byTime !== 0) return byTime;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Turns a post's answers, as the database returns them to her, into the two
 * levels the post screen shows: the answers to the post in the order they were
 * written, each with its own answers in the order they were written.
 *
 * An answer whose parent is not in the list is left out. The parent is missing
 * because she cannot see it (hidden by the team, or waiting for review), and an
 * answer to a message she cannot see reads out of context and may quote it. A
 * deleted parent is still in the list as a tombstone, so its answers stay.
 *
 * The database keeps every answer within two levels. An answer that names a
 * level-two answer as its parent is left out here too, so the screen never
 * draws a third level whatever the rows say.
 */
export function buildReplyThread(
  replies: readonly ForumReplyRow[],
): readonly ForumReplyThreadEntry[] {
  const sorted = [...replies].sort(byCreatedAtThenId);
  const childrenByParentId = new Map<string, ForumReplyRow[]>();
  const thread: { reply: ForumReplyRow; children: ForumReplyRow[] }[] = [];

  for (const row of sorted) {
    if (row.parent_reply_id !== null) continue;
    const children: ForumReplyRow[] = [];
    childrenByParentId.set(row.id, children);
    thread.push({ reply: row, children });
  }
  for (const row of sorted) {
    if (row.parent_reply_id === null) continue;
    childrenByParentId.get(row.parent_reply_id)?.push(row);
  }
  return thread;
}
