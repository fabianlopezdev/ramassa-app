import { describe, expect, test } from 'bun:test';
import {
  attendanceOverviewSearchSchema,
  buildAttendanceOverview,
  buildAttendanceSheet,
  filterAttendanceOverview,
  mergeAttendanceMark,
  mergeAttendanceMarks,
  nextAttendanceMarkedAt,
  nextAttendanceStatus,
  type AttendanceMark,
} from './attendance';

const occurrence = {
  id: 'occurrence-1',
  event_id: 'event-1',
  starts_at: '2026-08-09T16:00:00.000Z',
  ends_at: '2026-08-09T17:30:00.000Z',
};
const event = {
  id: 'event-1',
  title: { ca: 'Sessió d’entrenament', es: 'Sesión de entrenamiento' },
  location: 'Camp Municipal',
};
const profiles = [
  { id: 'player-1', first_name: 'Amina', last_name: 'Hassan', is_active: true },
  { id: 'player-2', first_name: 'Fatima', last_name: 'Zahra', is_active: false },
  { id: 'player-3', first_name: 'Oksana', last_name: 'Melnyk', is_active: true },
] as const;

function mark(overrides: Partial<AttendanceMark> = {}): AttendanceMark {
  return {
    id: 'mark-1',
    occurrence_id: 'occurrence-1',
    player_id: 'player-1',
    status: 'present',
    marked_by: 'coach-1',
    marked_at: '2026-08-09T12:00:00.000Z',
    updated_at: '2026-08-09T12:00:01.000Z',
    ...overrides,
  };
}

describe('attendance status cycle', () => {
  test('one tap advances unmarked, present, absent, and excused in the field order', () => {
    expect(nextAttendanceStatus(null)).toBe('present');
    expect(nextAttendanceStatus('present')).toBe('absent');
    expect(nextAttendanceStatus('absent')).toBe('excused');
    expect(nextAttendanceStatus('excused')).toBe('present');
  });

  test('the tap clock stays monotonic when the device clock stalls or moves backwards', () => {
    expect(
      nextAttendanceMarkedAt('2026-08-09T09:00:00.000Z', new Date('2026-08-09T08:00:00Z')),
    ).toBe('2026-08-09T09:00:00.001Z');
    expect(nextAttendanceMarkedAt(null, new Date('2026-08-09T10:00:00Z'))).toBe(
      '2026-08-09T10:00:00.000Z',
    );
  });
});

describe('attendance conflict resolution', () => {
  test('the later device timestamp wins even when messages arrive out of order', () => {
    const deviceA: AttendanceMark = {
      id: 'mark-1',
      occurrence_id: 'occurrence-1',
      player_id: 'player-1',
      status: 'present',
      marked_by: 'coach-a',
      marked_at: '2026-08-09T09:00:00.000Z',
      updated_at: '2026-08-09T09:00:01.000Z',
    };
    const deviceB: AttendanceMark = {
      ...deviceA,
      status: 'excused',
      marked_by: 'coach-b',
      marked_at: '2026-08-09T09:00:05.000Z',
      updated_at: '2026-08-09T09:00:06.000Z',
    };

    expect(mergeAttendanceMark(deviceA, deviceB)).toEqual(deviceB);
    expect(mergeAttendanceMark(deviceB, deviceA)).toEqual(deviceB);
  });

  test('a realtime payload updates only its participant and preserves sheet order', () => {
    const first: AttendanceMark = {
      id: 'mark-1',
      occurrence_id: 'occurrence-1',
      player_id: 'player-1',
      status: 'present',
      marked_by: 'coach-a',
      marked_at: '2026-08-09T09:00:00.000Z',
      updated_at: '2026-08-09T09:00:01.000Z',
    };
    const second: AttendanceMark = {
      ...first,
      id: 'mark-2',
      player_id: 'player-2',
    };
    const realtimeUpdate: AttendanceMark = {
      ...second,
      status: 'absent',
      marked_by: 'coach-b',
      marked_at: '2026-08-09T09:01:00.000Z',
      updated_at: '2026-08-09T09:01:01.000Z',
    };

    expect(mergeAttendanceMarks([first, second], realtimeUpdate)).toEqual([first, realtimeUpdate]);
  });

  test('a server echo replaces its equal-clock optimistic shell without changing first-writer ties', () => {
    const optimistic = mark({ id: 'local:occurrence-1:player-1' });
    const accepted = mark({ id: 'server-mark', updated_at: '2026-08-09T12:00:02.000Z' });
    expect(mergeAttendanceMark(optimistic, accepted)).toEqual(accepted);
    expect(mergeAttendanceMark(accepted, { ...accepted, id: 'other-server-mark' })).toEqual(
      accepted,
    );
  });
});

describe('attendance sheet participants', () => {
  test('combines the active roster with confirmed or interested signups and orders signups first', () => {
    const sheet = buildAttendanceSheet({
      occurrence,
      event,
      profiles,
      signups: [
        { player_id: 'player-2', state: 'confirmed' },
        { player_id: 'player-3', state: 'cancelled' },
      ],
      marks: [],
    });

    expect(sheet.participants.map((participant) => participant.id)).toEqual([
      'player-2',
      'player-1',
      'player-3',
    ]);
    expect(sheet.participants[0]?.signed_up).toBe(true);
    expect(sheet.participants[2]?.signed_up).toBe(false);
  });

  test('keeps only the newest mark per participant', () => {
    const older = mark({ player_id: 'player-1', marked_at: '2026-08-09T10:00:00.000Z' });
    const newer = mark({
      id: 'mark-newer',
      player_id: 'player-1',
      status: 'excused',
      marked_at: '2026-08-09T10:01:00.000Z',
    });
    const sheet = buildAttendanceSheet({
      occurrence,
      event,
      profiles,
      signups: [],
      marks: [newer, older],
    });

    expect(sheet.participants[0]?.mark?.status).toBe('excused');
  });
});

describe('attendance overview', () => {
  const rows = buildAttendanceOverview({
    occurrences: [
      occurrence,
      { ...occurrence, id: 'occurrence-2', event_id: 'event-2' },
      { ...occurrence, id: 'occurrence-3', event_id: 'event-3' },
    ],
    events: [
      event,
      { ...event, id: 'event-2', title: { ca: 'Partit amistós' } },
      { ...event, id: 'event-3', title: { ca: 'Taller complet' } },
    ],
    profiles,
    signups: [],
    marks: [
      mark({ player_id: 'player-1' }),
      mark({ id: 'mark-2', occurrence_id: 'occurrence-3', player_id: 'player-1' }),
      mark({ id: 'mark-3', occurrence_id: 'occurrence-3', player_id: 'player-3' }),
    ],
  });

  test('derives empty, in-progress, and complete from independent expected counts', () => {
    expect(rows.map((row) => [row.state, row.marked_count, row.expected_count])).toEqual([
      ['in_progress', 1, 2],
      ['empty', 0, 2],
      ['complete', 2, 2],
    ]);
  });

  test('normalizes accents and filters status from URL-safe search state', () => {
    const search = attendanceOverviewSearchSchema.parse({ q: 'sessio', status: 'in_progress' });
    expect(filterAttendanceOverview(rows, search).map((row) => row.occurrence_id)).toEqual([
      'occurrence-1',
    ]);
  });

  test('hostile or unknown search values are data, never executable filter syntax', () => {
    const search = attendanceOverviewSearchSchema.parse({
      q: '<img src=x onerror=alert(1)>',
      status: 'not-a-state',
    });
    expect(search.status).toBe('all');
    expect(filterAttendanceOverview(rows, search)).toEqual([]);
  });
});
