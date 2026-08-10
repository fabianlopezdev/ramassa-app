import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAttendanceHistory,
  fetchAttendanceParticipantStats,
  type AttendanceParticipantStats,
  type AttendanceReportRow,
} from '@ramassa/shared/attendance';
import { useAuth } from '@ramassa/shared/auth';

const SIGNED_OUT_QUERY_SCOPE = 'signed-out';
const ATTENDANCE_HISTORY_STALE_TIME_MS = 30_000;
const ATTENDANCE_HISTORY_LIMIT = 5;

export interface OwnAttendanceHistory {
  readonly stats: AttendanceParticipantStats | null;
  readonly rows: readonly AttendanceReportRow[];
}

export function ownAttendanceHistoryQueryKey(userId: string) {
  return ['own-attendance-history', userId] as const;
}

export function useOwnAttendanceHistory() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery<OwnAttendanceHistory>({
    queryKey: ownAttendanceHistoryQueryKey(userId ?? SIGNED_OUT_QUERY_SCOPE),
    enabled: userId !== null,
    staleTime: ATTENDANCE_HISTORY_STALE_TIME_MS,
    queryFn: async ({ signal }) => {
      if (userId === null) return { stats: null, rows: [] };
      const [stats, rows] = await Promise.all([
        fetchAttendanceParticipantStats(supabase, userId, signal),
        fetchAttendanceHistory(supabase, userId, {
          limit: ATTENDANCE_HISTORY_LIMIT,
          signal,
        }),
      ]);
      return { stats, rows };
    },
  });
}
