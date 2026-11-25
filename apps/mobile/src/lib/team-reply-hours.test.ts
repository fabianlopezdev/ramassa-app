import { describe, expect, test } from 'bun:test';
import { isWithinTeamReplyHours } from './team-reply-hours';

describe('the team reply hours, club time (RAPP-971)', () => {
  test('a weekday between 9:00 and 17:00 in Madrid is inside', () => {
    // Wednesday 25 November 2026, 09:00 and 16:59 in Madrid (UTC+1).
    expect(isWithinTeamReplyHours(new Date('2026-11-25T08:00:00Z'))).toBe(true);
    expect(isWithinTeamReplyHours(new Date('2026-11-25T15:59:00Z'))).toBe(true);
  });

  test('before 9:00, from 17:00 and at weekends is outside', () => {
    expect(isWithinTeamReplyHours(new Date('2026-11-25T07:59:00Z'))).toBe(false);
    expect(isWithinTeamReplyHours(new Date('2026-11-25T16:00:00Z'))).toBe(false);
    // Saturday 28 November 2026, 11:00 in Madrid.
    expect(isWithinTeamReplyHours(new Date('2026-11-28T10:00:00Z'))).toBe(false);
  });

  test('summer time follows Madrid', () => {
    // Monday 6 July 2026, 09:00 in Madrid (UTC+2), still 07:00 UTC.
    expect(isWithinTeamReplyHours(new Date('2026-07-06T07:00:00Z'))).toBe(true);
    expect(isWithinTeamReplyHours(new Date('2026-07-06T15:00:00Z'))).toBe(false);
  });
});
