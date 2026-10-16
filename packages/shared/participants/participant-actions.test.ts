/**
 * The roster page goes through `list_participants` (RAPP-240), so these check
 * the question sent to it and the page read back: every filter forwarded as the
 * staff member set it, the search turned into a safe prefix query, and the
 * total taken from the rows.
 */
import { describe, expect, test } from 'bun:test';
import { fetchParticipants } from './participant-actions';
import { parseParticipantSearch, PARTICIPANT_PAGE_SIZE } from './participant-query';

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

const row = {
  id: '5eed0000-0000-4000-8000-000000000026',
  first_name: 'Amina',
  last_name: 'Al-Hassan',
  nationality: null,
  city: null,
  reference_entity: 'Creu Roja Osona',
  has_dependents: null,
  num_dependents: null,
  is_active: true,
  preferred_language: 'ar',
  created_at: '2026-09-01T10:00:00Z',
  joined: true,
};

describe('fetchParticipants', () => {
  test('forwards every filter, the sort and the page to list_participants', async () => {
    const { client, calls } = clientReturning({ data: [], error: null });
    await fetchParticipants(
      client,
      parseParticipantSearch({
        q: 'nu se',
        entity: 'Creu Roja Osona',
        nationality: 'Síria',
        status: 'inactive',
        dependents: 'with',
        sort: 'city',
        dir: 'desc',
        page: '3',
      }),
    );
    expect(calls).toEqual([
      {
        name: 'list_participants',
        args: {
          p_query: 'nu:* & se:*',
          p_entity: 'Creu Roja Osona',
          p_nationality: 'Síria',
          p_status: 'inactive',
          p_dependents: 'with',
          p_sort: 'city',
          p_dir: 'desc',
          p_page: 3,
          p_page_size: PARTICIPANT_PAGE_SIZE,
        },
      },
    ]);
  });

  test('an unset filter is left out, so the database applies none', async () => {
    const { client, calls } = clientReturning({ data: [], error: null });
    await fetchParticipants(client, parseParticipantSearch({}));
    const args = calls[0]?.args as Record<string, unknown>;
    expect(args.p_query).toBe('');
    expect(args.p_entity).toBeUndefined();
    expect(args.p_nationality).toBeUndefined();
  });

  test('reads the rows without the total column, and the total from it', async () => {
    const { client } = clientReturning({ data: [{ ...row, total_count: 41 }], error: null });
    const page = await fetchParticipants(client, parseParticipantSearch({}));
    expect(page.total).toBe(41);
    expect(page.rows).toEqual([row]);
  });

  test('an empty page has a total of zero', async () => {
    const { client } = clientReturning({ data: [], error: null });
    expect((await fetchParticipants(client, parseParticipantSearch({}))).total).toBe(0);
  });

  test('a database error becomes a typed DB-1 error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(fetchParticipants(client, parseParticipantSearch({}))).rejects.toMatchObject({
      code: 'DB-1',
    });
  });
});
