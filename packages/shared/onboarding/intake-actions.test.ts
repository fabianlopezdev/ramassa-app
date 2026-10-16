/**
 * The wizard reads which of her questions are already answered (RAPP-300).
 * A failed read must never look like "nothing answered": that would ask her
 * everything again and, worse, send every question back over staff answers.
 */
import { describe, expect, test } from 'bun:test';
import { fetchMyAnsweredQuestions } from './intake-actions';

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: string[] = [];
  const client = {
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

describe('fetchMyAnsweredQuestions', () => {
  test('asks the database for her own answered questions', async () => {
    const { client, calls } = clientReturning({ data: ['nationality'], error: null });
    await fetchMyAnsweredQuestions(client);
    expect(calls).toEqual(['my_answered_questions']);
  });

  test('returns the known questions as a set', async () => {
    const { client } = clientReturning({ data: ['nationality', 'phone'], error: null });
    expect(await fetchMyAnsweredQuestions(client)).toEqual(new Set(['nationality', 'phone']));
  });

  test('no rows is an empty set: nobody answered anything for her', async () => {
    const { client } = clientReturning({ data: null, error: null });
    expect((await fetchMyAnsweredQuestions(client)).size).toBe(0);
  });

  test('a failed read is a typed DB-1 error, never an empty set', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(fetchMyAnsweredQuestions(client)).rejects.toMatchObject({ code: 'DB-1' });
  });
});
