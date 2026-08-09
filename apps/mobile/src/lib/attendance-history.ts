import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAttendanceHistory,
  fetchAttendanceParticipantStats,
  type AttendanceParticipantStats,
  type AttendanceReportRow,
} from '@ramassa/shared/attendance';
import { useAuth } from '@ramassa/shared/auth';

export interface OwnAttendanceHistory {
  readonly stats: AttendanceParticipantStats | null;
  readonly rows: readonly AttendanceReportRow[];
}

export function ownAttendanceHistoryQueryKey(userId: string) {
  return ['own-attendance-history', userId] as const;
}

export function useOwnAttendanceHistory() {
  const { user } = useAuth();
  return useQuery<OwnAttendanceHistory>({
    queryKey: ownAttendanceHistoryQueryKey(user?.id ?? 'signed-out'),
    enabled: user !== null,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      if (user === null) return { stats: null, rows: [] };
      const [stats, rows] = await Promise.all([
        fetchAttendanceParticipantStats(supabase, user.id, signal),
        fetchAttendanceHistory(supabase, user.id, { limit: 5, signal }),
      ]);
      return { stats, rows };
    },
  });
}
