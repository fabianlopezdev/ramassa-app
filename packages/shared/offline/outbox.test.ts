import { describe, expect, test } from 'bun:test';
import { AppError } from '../errors';
import { createOutbox, isFinalRejection, type OutboxConfig, type OutboxEntry } from './outbox';

interface Note extends OutboxEntry {
  readonly text: string;
  readonly createdAt: string;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => void values.set(key, value),
    remove: (key: string) => values.delete(key),
  };
}

function config(mode: 'sequential' | 'independent'): OutboxConfig<Note> {
  return {
    key: 'test.outbox.v1',
    version: 1,
    isEntry: (value): value is Note =>
      typeof value === 'object' && value !== null && typeof (value as Note).id === 'string',
    compare: (left, right) => left.createdAt.localeCompare(right.createdAt),
    isSameVersion: (left, right) => left.id === right.id && left.createdAt === right.createdAt,
    mode,
  };
}

const NOW = new Date('2026-10-11T10:00:00.000Z');

function note(id: string, second: number) {
  return { id, text: id, createdAt: `2026-10-11T09:00:0${second}.000Z` };
}

describe('the shared outbox', () => {
  test('a refusal stays, marked rejected with its code, and is not sent again', async () => {
    const outbox = createOutbox(memoryStorage(), 'owner', config('independent'));
    outbox.enqueue(note('a', 1));
    let sends = 0;
    const refuse = async () => {
      sends += 1;
      throw new AppError('AUTH-3');
    };

    const first = await outbox.drain(refuse, NOW);
    expect(first).toMatchObject({ sent: 0, failed: 0, rejected: 1, nextRetryAt: null });
    expect(outbox.list()[0]?.rejection).toEqual({ code: 'AUTH-3', at: NOW.toISOString() });

    await outbox.drain(refuse, NOW);
    expect(sends).toBe(1);
  });

  test('retry puts a rejected change back in line; discard removes it', async () => {
    const outbox = createOutbox(memoryStorage(), 'owner', config('independent'));
    outbox.enqueue(note('a', 1));
    outbox.enqueue(note('b', 2));
    await outbox.drain(async () => {
      throw new AppError('VALIDATION-1');
    }, NOW);

    outbox.retry('a');
    outbox.discard('b');
    expect(outbox.list().map((entry) => [entry.id, entry.rejection ?? null])).toEqual([
      ['a', null],
    ]);

    const delivered = await outbox.drain(async (entry) => entry.id, NOW);
    expect(delivered.delivered).toEqual(['a']);
    expect(outbox.list()).toEqual([]);
  });

  test('a failure that may pass is retried later, with a growing delay', async () => {
    const outbox = createOutbox(memoryStorage(), 'owner', config('independent'));
    outbox.enqueue(note('a', 1));
    const result = await outbox.drain(async () => {
      throw new AppError('NETWORK-1');
    }, NOW);
    expect(result).toMatchObject({
      failed: 1,
      rejected: 0,
      nextRetryAt: '2026-10-11T10:00:01.000Z',
    });
    expect(outbox.list()[0]).toMatchObject({ attemptCount: 1, rejection: null });
  });

  test('in order: a rejected change does not hold the next ones; a failing one does', async () => {
    const outbox = createOutbox(memoryStorage(), 'owner', config('sequential'));
    outbox.enqueue(note('a', 1));
    outbox.enqueue(note('b', 2));
    outbox.enqueue(note('c', 3));
    const sent: string[] = [];
    const result = await outbox.drain(async (entry) => {
      if (entry.id === 'a') throw new AppError('AUTH-3');
      if (entry.id === 'b') throw new Error('offline');
      sent.push(entry.id);
    }, NOW);
    expect(result).toMatchObject({ rejected: 1, failed: 1, sent: 0 });
    expect(sent).toEqual([]);
  });

  test('entries saved before the rejected state existed still load and send', async () => {
    const storage = memoryStorage();
    storage.set(
      'test.outbox.v1',
      JSON.stringify({
        version: 1,
        entries: [{ ...note('old', 1), ownerId: 'owner', attemptCount: 2, retryAt: null }],
      }),
    );
    const outbox = createOutbox(storage, 'owner', config('independent'));
    const result = await outbox.drain(async (entry) => entry.id, NOW);
    expect(result.delivered).toEqual(['old']);
  });

  test('each person sees only her own changes', () => {
    const storage = memoryStorage();
    createOutbox(storage, 'one', config('independent')).enqueue(note('a', 1));
    expect(createOutbox(storage, 'two', config('independent')).list()).toEqual([]);
  });
});

describe('a send that never answers', () => {
  test('counts as a failed try after the time limit, so the queue moves on and retries it', async () => {
    const outbox = createOutbox(memoryStorage(), 'owner', config('independent'));
    outbox.enqueue(note('a', 1));
    outbox.enqueue(note('b', 2));
    const sent: string[] = [];
    const result = await outbox.drain(
      (entry) => {
        if (entry.id === 'a') return new Promise<never>(() => undefined);
        sent.push(entry.id);
        return Promise.resolve(entry.id);
      },
      NOW,
      { sendTimeoutMs: 20 },
    );
    expect(result).toMatchObject({ sent: 1, failed: 1, rejected: 0 });
    expect(sent).toEqual(['b']);
    expect(outbox.list().map((entry) => entry.id)).toEqual(['a']);
    expect(outbox.list()[0]?.retryAt).not.toBeNull();
    // The lane is free again: a later drain is not stuck behind the hung send.
    const later = await outbox.drain(() => Promise.resolve('a'), new Date(NOW.getTime() + 60_000));
    expect(later.sent).toBe(1);
  });
});

describe('isFinalRejection', () => {
  test('refusals are final; connection and server failures are not', () => {
    for (const code of ['AUTH-3', 'AUTH-9', 'DB-2', 'EVENTS-1', 'VALIDATION-1'] as const) {
      expect(isFinalRejection(new AppError(code))).toBe(true);
    }
    for (const code of ['DB-1', 'NETWORK-1', 'AUTH-2', 'UNEXPECTED-1'] as const) {
      expect(isFinalRejection(new AppError(code))).toBe(false);
    }
    expect(isFinalRejection(new TypeError('fetch failed'))).toBe(false);
  });
});
