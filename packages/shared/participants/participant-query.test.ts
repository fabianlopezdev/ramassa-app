/**
 * The participants query (RAPP-23): the URL's search params in, a Supabase
 * query out.
 *
 * This is the layer where a staff member's filters become a database question,
 * so the tests are about the question being the one she asked: every filter
 * applied, none invented, and nothing from the URL reaching the query except
 * through the schema. The URL is user input like any other, and this table is
 * the roster of a shelter.
 */

import { describe, expect, test } from 'bun:test';
import {
  applyParticipantQuery,
  parseParticipantSearch,
  PARTICIPANT_PAGE_SIZE,
  type ParticipantSearch,
} from './participant-query';

/** Records what the builder was asked to do, in the order it was asked. */
function recordingBuilder() {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['eq', 'or', 'textSearch', 'order', 'range', 'not', 'is']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return { builder, calls };
}

function callsTo(calls: { method: string; args: unknown[] }[], method: string) {
  return calls.filter((call) => call.method === method).map((call) => call.args);
}

describe('parseParticipantSearch', () => {
  test('an empty URL yields the first page of everyone, newest sort last', () => {
    const parsed = parseParticipantSearch({});
    expect(parsed).toEqual({
      q: '',
      entity: null,
      nationality: null,
      status: 'all',
      dependents: 'all',
      sort: 'last_name',
      dir: 'asc',
      page: 1,
    });
  });

  test('reads the filters a staff member actually set', () => {
    const parsed = parseParticipantSearch({
      q: 'amina',
      entity: 'Creu Roja Osona',
      nationality: 'Síria',
      status: 'inactive',
      dependents: 'with',
      sort: 'city',
      dir: 'desc',
      page: '3',
    });
    expect(parsed.q).toBe('amina');
    expect(parsed.entity).toBe('Creu Roja Osona');
    expect(parsed.status).toBe('inactive');
    expect(parsed.dependents).toBe('with');
    expect(parsed.sort).toBe('city');
    expect(parsed.dir).toBe('desc');
    expect(parsed.page).toBe(3);
  });

  /**
   * A hand-edited URL is the cheapest attack surface on an admin screen. The
   * sort column especially: it is interpolated into an `order()` call, so a
   * free-string sort is an invitation.
   */
  test('an unknown sort column falls back instead of reaching the query', () => {
    expect(parseParticipantSearch({ sort: 'document_number' }).sort).toBe('last_name');
    expect(parseParticipantSearch({ sort: 'id); drop table profiles;--' }).sort).toBe('last_name');
  });

  test('a nonsense page or status falls back rather than erroring at the user', () => {
    expect(parseParticipantSearch({ page: '-4' }).page).toBe(1);
    expect(parseParticipantSearch({ page: 'nope' }).page).toBe(1);
    expect(parseParticipantSearch({ status: 'deleted' }).status).toBe('all');
  });

  /**
   * A URL is strings all the way down, so an absent filter comes back as the
   * four characters "null" rather than as null. Read literally, that filters
   * the roster to an entity by that name and the table shows nobody: the bug
   * looks like "search is broken" and is actually a round trip.
   */
  test('an absent filter survives the round trip through the URL as absent', () => {
    expect(parseParticipantSearch({ entity: 'null', nationality: 'null' })).toMatchObject({
      entity: null,
      nationality: null,
    });
    expect(parseParticipantSearch({ entity: '', nationality: '' })).toMatchObject({
      entity: null,
      nationality: null,
    });
    expect(parseParticipantSearch({ entity: 'undefined' })).toMatchObject({ entity: null });
  });

  test('an entity that genuinely contains those letters still filters', () => {
    expect(parseParticipantSearch({ entity: 'Nullestrand' }).entity).toBe('Nullestrand');
  });

  test('an encrypted field is not offered as a sort column', () => {
    for (const column of ['document_number', 'phone', 'address', 'postal_code']) {
      expect(parseParticipantSearch({ sort: column }).sort).toBe('last_name');
    }
  });
});

describe('applyParticipantQuery', () => {
  const base: ParticipantSearch = parseParticipantSearch({});

  test('always scopes to participants: staff and entities are not roster rows', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, base);
    expect(callsTo(calls, 'eq')).toContainEqual(['role', 'player']);
  });

  test('asks for one page, not the whole organization', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, { ...base, page: 3 });
    expect(callsTo(calls, 'range')).toEqual([
      [2 * PARTICIPANT_PAGE_SIZE, 3 * PARTICIPANT_PAGE_SIZE - 1],
    ]);
  });

  test('an empty search box adds no text search at all', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, base);
    expect(callsTo(calls, 'textSearch')).toEqual([]);
  });

  test('a search term goes to the indexed document, not to a LIKE over columns', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, { ...base, q: 'nuria serra' });
    const [args] = callsTo(calls, 'textSearch');
    expect(args?.[0]).toBe('search_document');
    expect(args?.[1]).toBe('nuria serra');
    expect(args?.[2]).toMatchObject({ type: 'websearch', config: 'simple' });
  });

  test('each filter is applied, and only when it is set', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, {
      ...base,
      entity: 'Creu Roja Osona',
      nationality: 'Síria',
      status: 'active',
      dependents: 'with',
    });
    const eqs = callsTo(calls, 'eq');
    expect(eqs).toContainEqual(['reference_entity', 'Creu Roja Osona']);
    expect(eqs).toContainEqual(['nationality', 'Síria']);
    expect(eqs).toContainEqual(['is_active', true]);
    expect(eqs).toContainEqual(['has_dependents', true]);
  });

  test('"all" means no predicate, rather than a predicate matching everything', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, { ...base, status: 'all', dependents: 'all' });
    const columns = callsTo(calls, 'eq').map(([column]) => column);
    expect(columns).not.toContain('is_active');
    expect(columns).not.toContain('has_dependents');
  });

  test('inactive and without-dependents are real filters, not the absence of one', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, {
      ...base,
      status: 'inactive',
      dependents: 'without',
    });
    const eqs = callsTo(calls, 'eq');
    expect(eqs).toContainEqual(['is_active', false]);
    expect(eqs).toContainEqual(['has_dependents', false]);
  });

  test('sorting is stable: the chosen column, then a tiebreaker', () => {
    const { builder, calls } = recordingBuilder();
    applyParticipantQuery(builder as never, { ...base, sort: 'city', dir: 'desc' });
    const orders = callsTo(calls, 'order');
    expect(orders[0]).toEqual(['city', { ascending: false }]);
    // Without a tiebreaker, two people from the same town can swap places
    // between pages and one of them is never shown at all.
    expect(orders[1]).toEqual(['id', { ascending: true }]);
  });
});
