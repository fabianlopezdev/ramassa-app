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

/**
 * How the line of a message above passes beside a row: down the whole row,
 * down to the row's avatar and no further (its last answer), or not at all
 * (its answers ended in an earlier row).
 */
export type ForumThreadRail = 'through' | 'end' | 'none';

/** One answer as one row of the post screen's list (RAPP-884). */
export interface ForumThreadRow {
  readonly reply: ForumReplyRow;
  readonly level: 1 | 2;
  /** The lines of the messages above it that pass beside it, the post's first. */
  readonly rails: readonly ForumThreadRail[];
  /** Whether a line runs down from under its own avatar to its answers. */
  readonly hasAnswersBelow: boolean;
  /** For an answer to an answer, the name of the person it answers. */
  readonly answersTo: string | null;
}

/**
 * The thread as rows, one per message, so the list recycles small rows and can
 * scroll to any one answer. Each row carries the pieces of the lines above it,
 * so the lines join from row to row into one continuous line.
 */
export function threadRows(thread: readonly ForumReplyThreadEntry[]): readonly ForumThreadRow[] {
  return thread.flatMap(({ reply, children }, index) => {
    const isLastAnswer = index === thread.length - 1;
    const answerRow: ForumThreadRow = {
      reply,
      level: 1,
      rails: [isLastAnswer ? 'end' : 'through'],
      hasAnswersBelow: children.length > 0,
      answersTo: null,
    };
    const childRows = children.map((child, childIndex): ForumThreadRow => ({
      reply: child,
      level: 2,
      rails: [
        isLastAnswer ? 'none' : 'through',
        childIndex === children.length - 1 ? 'end' : 'through',
      ],
      hasAnswersBelow: false,
      answersTo: reply.author_first_name,
    }));
    return [answerRow, ...childRows];
  });
}
