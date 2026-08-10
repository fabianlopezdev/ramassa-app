const ATTENDANCE_COACH_CACHE_PREFIX = 'ramassa.attendance-coach.v1';
const CACHED_ATTENDANCE_COACH_VALUE = 'true';

export interface AttendanceCoachCacheStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

function cacheKey(userId: string): string {
  return `${ATTENDANCE_COACH_CACHE_PREFIX}:${userId}`;
}

/**
 * A navigation hint only, never authorization. It keeps the coach surface
 * reachable on an offline cold start; every database read/write still crosses
 * the staff-only RLS boundary.
 */
export function rememberAttendanceCoach(
  storage: AttendanceCoachCacheStorage,
  userId: string,
  isCoach: boolean,
): void {
  if (isCoach) {
    storage.set(cacheKey(userId), CACHED_ATTENDANCE_COACH_VALUE);
  } else {
    storage.remove(cacheKey(userId));
  }
}

export function isAttendanceCoachCached(
  storage: AttendanceCoachCacheStorage,
  userId: string,
): boolean {
  return storage.getString(cacheKey(userId)) === CACHED_ATTENDANCE_COACH_VALUE;
}
