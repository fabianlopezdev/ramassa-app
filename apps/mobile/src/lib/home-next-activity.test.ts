import { expect, test } from 'bun:test';
import type { EventSignupState, PlayerEventOccurrence } from '@ramassa/shared/events';
import { pickNextPlayerActivity } from './home-next-activity';

const now = new Date('2026-11-16T10:00:00Z');

function occurrence(
  id: string,
  startsAt: string,
  signupState: EventSignupState | null = null,
): PlayerEventOccurrence {
  return {
    occurrence_id: id,
    occurrence_starts_at: startsAt,
    occurrence_ends_at: null,
    event: {
      id: `event-${id}`,
      category_id: 'category',
      status: 'published',
      published_at: '2026-11-01T10:00:00Z',
      expires_at: null,
    },
    signup: signupState === null ? null : { state: signupState },
  } as unknown as PlayerEventOccurrence;
}

test('no upcoming activity gives nothing', () => {
  expect(pickNextPlayerActivity(undefined, now)).toBeNull();
  expect(pickNextPlayerActivity([occurrence('past', '2026-11-15T10:00:00Z')], now)).toBeNull();
});

test('her next signed-up activity wins over an earlier one she has not joined', () => {
  const next = pickNextPlayerActivity(
    [
      occurrence('open', '2026-11-17T10:00:00Z'),
      occurrence('mine-later', '2026-11-20T10:00:00Z', 'confirmed'),
      occurrence('mine', '2026-11-18T10:00:00Z', 'interested'),
    ],
    now,
  );
  expect(next?.occurrence_id).toBe('mine');
});

test('a cancelled sign-up does not count as hers', () => {
  const next = pickNextPlayerActivity(
    [
      occurrence('cancelled', '2026-11-17T10:00:00Z', 'cancelled'),
      occurrence('mine', '2026-11-19T10:00:00Z', 'confirmed'),
    ],
    now,
  );
  expect(next?.occurrence_id).toBe('mine');
});

test('an activity that is no longer visible to players is skipped', () => {
  const hidden = occurrence('hidden', '2026-11-17T10:00:00Z');
  const next = pickNextPlayerActivity(
    [
      { ...hidden, event: { ...hidden.event, status: 'draft' } } as PlayerEventOccurrence,
      occurrence('open', '2026-11-18T10:00:00Z'),
    ],
    now,
  );
  expect(next?.occurrence_id).toBe('open');
});

test('without a sign-up, the first upcoming activity is shown', () => {
  const next = pickNextPlayerActivity(
    [
      occurrence('later', '2026-11-19T10:00:00Z'),
      occurrence('past', '2026-11-15T10:00:00Z', 'confirmed'),
      occurrence('soon', '2026-11-17T10:00:00Z'),
    ],
    now,
  );
  expect(next?.occurrence_id).toBe('soon');
});
