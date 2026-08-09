import { expect, test } from 'bun:test';
import {
  isAttendanceCoachCached,
  rememberAttendanceCoach,
  type AttendanceCoachCacheStorage,
} from './attendance-coach-cache';

function storage(): AttendanceCoachCacheStorage {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

test('the offline coach route hint survives restart and stays scoped to one identity', () => {
  const persisted = storage();
  rememberAttendanceCoach(persisted, 'coach-1', true);

  expect(isAttendanceCoachCached(persisted, 'coach-1')).toBe(true);
  expect(isAttendanceCoachCached(persisted, 'player-1')).toBe(false);

  rememberAttendanceCoach(persisted, 'coach-1', false);
  expect(isAttendanceCoachCached(persisted, 'coach-1')).toBe(false);
});
