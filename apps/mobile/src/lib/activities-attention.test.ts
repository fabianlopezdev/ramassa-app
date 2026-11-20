import { describe, expect, test } from 'bun:test';
import type { EventSignupState, PlayerEventOccurrence } from '@ramassa/shared/events';
import type { HomeSeen } from '@ramassa/shared/home-seen';
import { buildActivitiesAttention } from './activities-attention';
import { buildHomeAttention, type HomeAttention } from './home-attention';

const now = new Date('2026-11-16T10:00:00Z');
const SINCE = '2026-11-01T00:00:00Z';
const AFTER_SINCE = '2026-11-10T10:00:00Z';
const BEFORE_SINCE = '2026-10-20T10:00:00Z';
const LIST_SEEN_BEFORE = '2026-11-09T10:00:00Z';
const LIST_SEEN_AFTER = '2026-11-12T10:00:00Z';
const LATER_PUBLISHED = '2026-11-14T10:00:00Z';

interface OccurrenceOptions {
  readonly publishedAt?: string;
  readonly signupState?: EventSignupState | null;
  readonly status?: string;
}

function occurrence(
  eventId: string,
  occurrenceId: string,
  startsAt: string,
  options: OccurrenceOptions = {},
): PlayerEventOccurrence {
  const signupState = options.signupState ?? null;
  return {
    occurrence_id: occurrenceId,
    occurrence_starts_at: startsAt,
    occurrence_ends_at: null,
    event: {
      id: eventId,
      category_id: 'category',
      status: options.status ?? 'published',
      published_at: options.publishedAt ?? AFTER_SINCE,
      expires_at: null,
    },
    signup: signupState === null ? null : { id: `signup-${eventId}`, state: signupState },
  } as unknown as PlayerEventOccurrence;
}

function seenRecord(eventIds: readonly string[] = []): HomeSeen {
  return { since: SINCE, announcementIds: [], eventIds };
}

/** When she last saw each list; `null` is never, `undefined` is not loaded yet. */
interface ListsSeen {
  readonly home?: string | null;
  readonly activities?: string | null;
}

const NEVER_SEEN: ListsSeen = { home: null, activities: null };

/** What Inici counts for the same data, so the two tabs can be compared. */
function homeFor(
  events: readonly PlayerEventOccurrence[] | undefined,
  seen: HomeSeen | undefined,
  lists: ListsSeen = NEVER_SEEN,
): HomeAttention {
  return buildHomeAttention(
    {
      forms: undefined,
      surveys: undefined,
      events,
      announcements: undefined,
      seen,
      homeSeenAt: lists.home,
    },
    now,
  );
}

function activitiesFor(
  events: readonly PlayerEventOccurrence[] | undefined,
  seen: HomeSeen | undefined,
  lists: ListsSeen = NEVER_SEEN,
) {
  return buildActivitiesAttention(
    {
      events,
      seen,
      activitiesSeenAt: lists.activities,
      homeAttention: homeFor(events, seen, lists),
    },
    now,
  );
}

/** A signed-up activity sits first on Inici, so Inici counts no new activity. */
const signedUpFirst = occurrence('mine', 'mine-1', '2026-11-17T10:00:00Z', {
  signupState: 'confirmed',
});

describe('buildActivitiesAttention, which cards say Nou', () => {
  test('before her seen record loads, nothing is new', () => {
    const result = activitiesFor(
      [signedUpFirst, occurrence('new', 'new-1', '2026-11-18T10:00:00Z')],
      undefined,
    );
    expect(result.count).toBe(0);
    expect(result.newOccurrenceIds.size).toBe(0);
  });

  test('before the activities load, nothing is new', () => {
    const result = activitiesFor(undefined, seenRecord());
    expect(result.count).toBe(0);
    expect(result.newOccurrenceIds.size).toBe(0);
  });

  test('an activity published after her record started, unopened and unanswered, is new', () => {
    const result = activitiesFor(
      [signedUpFirst, occurrence('new', 'new-1', '2026-11-18T10:00:00Z')],
      seenRecord(),
    );
    expect(result.count).toBe(1);
    expect([...result.newOccurrenceIds]).toEqual(['new-1']);
  });

  test('an activity published before her record started is not new', () => {
    const result = activitiesFor(
      [
        signedUpFirst,
        occurrence('old', 'old-1', '2026-11-18T10:00:00Z', { publishedAt: BEFORE_SINCE }),
      ],
      seenRecord(),
    );
    expect(result.count).toBe(0);
    expect(result.newOccurrenceIds.size).toBe(0);
  });

  test('opening an activity removes its mark and its number', () => {
    const events = [signedUpFirst, occurrence('opened', 'opened-1', '2026-11-18T10:00:00Z')];
    expect([...activitiesFor(events, seenRecord()).newOccurrenceIds]).toEqual(['opened-1']);
    const result = activitiesFor(events, seenRecord(['opened']));
    expect(result.count).toBe(0);
    expect(result.newOccurrenceIds.size).toBe(0);
  });

  test('an activity with a sign-up of hers in any state is not new', () => {
    const result = activitiesFor(
      [
        signedUpFirst,
        occurrence('interested', 'interested-1', '2026-11-18T10:00:00Z', {
          signupState: 'interested',
        }),
        occurrence('cancelled', 'cancelled-1', '2026-11-19T10:00:00Z', {
          signupState: 'cancelled',
        }),
      ],
      seenRecord(),
    );
    expect(result.count).toBe(0);
    expect(result.newOccurrenceIds.size).toBe(0);
  });

  test('an activity with many occurrences counts once, marked on its earliest upcoming one', () => {
    const result = activitiesFor(
      [
        signedUpFirst,
        occurrence('weekly', 'weekly-past', '2026-11-15T10:00:00Z'),
        occurrence('weekly', 'weekly-3', '2026-12-02T10:00:00Z'),
        occurrence('weekly', 'weekly-1', '2026-11-18T10:00:00Z'),
        occurrence('weekly', 'weekly-2', '2026-11-25T10:00:00Z'),
      ],
      seenRecord(),
    );
    expect(result.count).toBe(1);
    expect([...result.newOccurrenceIds]).toEqual(['weekly-1']);
  });

  test('past occurrences and activities hidden from players are left out', () => {
    const result = activitiesFor(
      [
        signedUpFirst,
        occurrence('past', 'past-1', '2026-11-15T10:00:00Z'),
        occurrence('draft', 'draft-1', '2026-11-18T10:00:00Z', { status: 'draft' }),
      ],
      seenRecord(),
    );
    expect(result.count).toBe(0);
    expect(result.newOccurrenceIds.size).toBe(0);
  });

  test('the new activity Inici shows says Nou here too, while its number stays on Inici', () => {
    const events = [
      occurrence('first', 'first-1', '2026-11-17T10:00:00Z'),
      occurrence('first', 'first-2', '2026-11-24T10:00:00Z'),
      occurrence('second', 'second-1', '2026-11-18T10:00:00Z'),
    ];
    const home = homeFor(events, seenRecord());
    expect(home.isNextActivityUnseen).toBe(true);
    expect(home.nextActivity?.event.id).toBe('first');
    const result = activitiesFor(events, seenRecord());
    expect([...result.newOccurrenceIds].sort()).toEqual(['first-1', 'second-1']);
    expect(result.count).toBe(1);
  });
});

describe('buildActivitiesAttention, the number on the tab', () => {
  const events = [signedUpFirst, occurrence('new', 'new-1', '2026-11-18T10:00:00Z')];

  test('before the news loads, nothing counts and the mark still shows', () => {
    const result = activitiesFor(events, seenRecord(), { home: undefined, activities: undefined });
    expect(result.count).toBe(0);
    expect([...result.newOccurrenceIds]).toEqual(['new-1']);
  });

  test('a new activity counts while the list was last seen before it was published', () => {
    const result = activitiesFor(events, seenRecord(), {
      home: null,
      activities: LIST_SEEN_BEFORE,
    });
    expect(result.count).toBe(1);
  });

  test('a new activity counts until the list is seen and keeps its mark after', () => {
    expect(activitiesFor(events, seenRecord()).count).toBe(1);
    const result = activitiesFor(events, seenRecord(), { home: null, activities: LIST_SEEN_AFTER });
    expect(result.count).toBe(0);
    expect([...result.newOccurrenceIds]).toEqual(['new-1']);
  });

  test('an activity published after the list was seen counts again', () => {
    const result = activitiesFor(
      [
        ...events,
        occurrence('later', 'later-1', '2026-11-19T10:00:00Z', { publishedAt: LATER_PUBLISHED }),
      ],
      seenRecord(),
      { home: null, activities: LIST_SEEN_AFTER },
    );
    expect(result.count).toBe(1);
    expect([...result.newOccurrenceIds].sort()).toEqual(['later-1', 'new-1']);
  });

  test('the count never includes more activities than the marked cards', () => {
    const result = activitiesFor(
      [
        signedUpFirst,
        occurrence('x', 'x-1', '2026-11-18T10:00:00Z'),
        occurrence('x', 'x-2', '2026-11-19T10:00:00Z'),
        occurrence('y', 'y-1', '2026-11-20T10:00:00Z'),
      ],
      seenRecord(),
    );
    expect(result.count).toBe(2);
    expect(result.newOccurrenceIds.size).toBe(2);
  });
});

describe('the two tabs together', () => {
  const events = [
    occurrence('a', 'a-1', '2026-11-17T10:00:00Z'),
    occurrence('b', 'b-1', '2026-11-18T10:00:00Z'),
    occurrence('b', 'b-2', '2026-11-25T10:00:00Z'),
    occurrence('c', 'c-1', '2026-11-19T10:00:00Z'),
  ];

  test('count each new activity exactly once while neither list is seen', () => {
    const home = homeFor(events, seenRecord());
    const activities = activitiesFor(events, seenRecord());
    expect(home.count).toBe(1);
    expect(activities.count).toBe(2);
  });

  test('never count one activity twice, whichever lists she has seen', () => {
    const moments = [undefined, null, LIST_SEEN_BEFORE, LIST_SEEN_AFTER];
    for (const homeSeenAt of moments) {
      for (const activitiesSeenAt of moments) {
        const lists = { home: homeSeenAt, activities: activitiesSeenAt };
        const home = homeFor(events, seenRecord(), lists);
        const activities = activitiesFor(events, seenRecord(), lists);
        expect(home.count + activities.count).toBeLessThanOrEqual(3);
      }
    }
  });

  test('seeing Inici clears its number and leaves the Activitats number as it was', () => {
    const lists = { home: LIST_SEEN_AFTER, activities: null };
    const home = homeFor(events, seenRecord(), lists);
    const activities = activitiesFor(events, seenRecord(), lists);
    expect(home.count).toBe(0);
    expect(activities.count).toBe(2);
    expect([...activities.newOccurrenceIds].sort()).toEqual(['a-1', 'b-1', 'c-1']);
  });

  test('once she opens the activity on Inici, Inici stops counting it and the rest still count here', () => {
    const seenAfterOpening = seenRecord(['a']);
    const home = homeFor(events, seenAfterOpening);
    expect(home.nextActivity?.event.id).toBe('a');
    expect(home.isNextActivityUnseen).toBe(false);
    const after = activitiesFor(events, seenAfterOpening);
    expect([...after.newOccurrenceIds].sort()).toEqual(['b-1', 'c-1']);
    expect(home.count + after.count).toBe(2);
  });

  test('when Inici activity passes, the next new one moves to Inici and leaves this count', () => {
    const withPast = [
      occurrence('a', 'a-1', '2026-11-16T09:00:00Z'),
      occurrence('b', 'b-1', '2026-11-18T10:00:00Z'),
      occurrence('c', 'c-1', '2026-11-19T10:00:00Z'),
    ];
    const home = homeFor(withPast, seenRecord());
    expect(home.nextActivity?.event.id).toBe('b');
    const result = activitiesFor(withPast, seenRecord());
    expect(result.count).toBe(1);
    expect([...result.newOccurrenceIds].sort()).toEqual(['b-1', 'c-1']);
    expect(home.count + result.count).toBe(2);
  });
});
