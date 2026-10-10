/**
 * The participants query (RAPP-23): the URL's search params in, a valid
 * search out. The query itself runs in the database (list_participants,
 * RAPP-240); participant-actions.test.ts checks the arguments it receives.
 *
 * This is the layer where a staff member's filters become a database question,
 * so the tests are about the question being the one she asked: every filter
 * applied, none invented, and nothing from the URL reaching the query except
 * through the schema. The URL is user input like any other, and this table is
 * the roster of a shelter.
 */

import { describe, expect, test } from 'bun:test';
import { buildPrefixTsQuery, parseParticipantSearch } from './participant-query';

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

/**
 * Search runs on every pause in typing, so the term is usually HALF A WORD.
 * Whole-token matching means "yo" finds nobody while Yolanda sits in the list
 * on screen, which is indistinguishable from broken.
 */
describe('buildPrefixTsQuery', () => {
  test('a half-typed word matches from its start', () => {
    expect(buildPrefixTsQuery('yo')).toBe('yo:*');
  });

  test('several words all have to match, each as a prefix', () => {
    expect(buildPrefixTsQuery('nuria ser')).toBe('nuria:* & ser:*');
  });

  test('accents are preserved: the document indexes both spellings', () => {
    expect(buildPrefixTsQuery('Torelló')).toBe('Torelló:*');
  });

  /**
   * The string is interpolated into a tsquery, so its operators are the
   * injection surface: an unescaped `&`, `!` or `(` is a syntax error at best
   * and a different query at worst.
   */
  test('tsquery operators in the input are stripped, not honoured', () => {
    expect(buildPrefixTsQuery('a & b | !c')).toBe('a:* & b:* & c:*');
    expect(buildPrefixTsQuery("nuria') | (1=1--")).toBe('nuria:* & 11:*');
    expect(buildPrefixTsQuery('<->')).toBe('');
  });

  test('an empty or whitespace-only term produces no query', () => {
    expect(buildPrefixTsQuery('')).toBe('');
    expect(buildPrefixTsQuery('   ')).toBe('');
  });

  test('non-Latin scripts survive intact', () => {
    expect(buildPrefixTsQuery('أمينة')).toBe('أمينة:*');
    expect(buildPrefixTsQuery('Оксана')).toBe('Оксана:*');
  });
});
