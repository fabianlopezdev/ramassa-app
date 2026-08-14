/**
 * The pure half of the participant detail (RAPP-24): the note schema, the
 * activity contract, and the small readings the screen does of a row.
 *
 * What is worth pinning here is where the screen could quietly lie. A note with
 * only spaces in it is not a note. An author the caller cannot see must read as
 * "unknown", not as the string "null null" over a colleague's signature. And the
 * activity timeline has to have a SHAPE before it has any data, or the six later
 * phases that feed it will each invent one.
 */

import { describe, expect, test } from 'bun:test';
import { participantNoteSchema } from '../schemas';
import {
  filterParticipantActivity,
  noteAuthorName,
  PARTICIPANT_ACTIVITY_KINDS,
  type ParticipantActivityEntry,
} from './participant-detail';

describe('participantNoteSchema', () => {
  test('a note with words in it is accepted, trimmed', () => {
    const parsed = participantNoteSchema.parse({ body: '  Ha demanat canviar l horari.  ' });
    expect(parsed.body).toBe('Ha demanat canviar l horari.');
  });

  /**
   * The database enforces the same rule (`length(btrim(body)) between 1 and
   * 4000`). This is the UX half of that pair: a staff member who taps Add on an
   * empty box should be told, not have the write refused by Postgres and
   * surfaced as a generic failure.
   */
  test('a note that is only whitespace is not a note', () => {
    expect(participantNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(participantNoteSchema.safeParse({ body: '' }).success).toBe(false);
  });

  test('a note longer than the column allows is rejected here rather than by Postgres', () => {
    expect(participantNoteSchema.safeParse({ body: 'a'.repeat(4000) }).success).toBe(true);
    expect(participantNoteSchema.safeParse({ body: 'a'.repeat(4001) }).success).toBe(false);
  });

  test('a note in Arabic script is a note like any other', () => {
    expect(participantNoteSchema.parse({ body: 'تحدثنا معها اليوم' }).body).toBe(
      'تحدثنا معها اليوم',
    );
  });
});

describe('noteAuthorName', () => {
  test('a note is signed with its author full name', () => {
    expect(noteAuthorName({ author: { first_name: 'Marta', last_name: 'Puig' } })).toBe(
      'Marta Puig',
    );
  });

  /**
   * An author row the caller cannot read comes back as null from the embed. The
   * screen needs to say "unknown" in the reader's own language, so the answer
   * here is the ABSENCE of a name rather than a string this module invented.
   */
  test('an unreadable author is absent, not a name assembled out of nulls', () => {
    expect(noteAuthorName({ author: null })).toBeNull();
  });
});

describe('the activity timeline contract', () => {
  const entries: readonly ParticipantActivityEntry[] = [
    {
      id: '1',
      kind: 'attendance',
      occurred_at: '2026-07-02T18:00:00Z',
      title: 'Entrenament',
      detail: null,
    },
    {
      id: '2',
      kind: 'feedback',
      occurred_at: '2026-07-01T18:00:00Z',
      title: 'Proposta',
      detail: null,
    },
  ];

  test('every kind the later phases will produce is declared up front', () => {
    // Eight sources, named once, so the tabs on the screen and the branches added
    // to the SQL union cannot drift into two different vocabularies.
    expect([...PARTICIPANT_ACTIVITY_KINDS]).toEqual([
      'attendance',
      'event_signup',
      'message',
      'forum_post',
      'feedback',
      'equipment',
      'service_interest',
      'referral_update',
    ]);
  });

  test('"all" is every entry, not a seventh kind nothing ever matches', () => {
    expect(filterParticipantActivity(entries, 'all')).toHaveLength(2);
  });

  test('a kind narrows to that kind', () => {
    expect(filterParticipantActivity(entries, 'attendance').map((entry) => entry.id)).toEqual([
      '1',
    ]);
  });

  test('a kind with nothing in it yet is empty, not everything', () => {
    expect(filterParticipantActivity(entries, 'equipment')).toHaveLength(0);
  });
});
