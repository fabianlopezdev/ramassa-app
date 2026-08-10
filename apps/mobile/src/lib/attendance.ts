import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAttendanceOccurrencesForDay,
  fetchAttendanceSheet,
  mergeAttendanceSheetMark,
  subscribeToAttendance,
  upsertAttendanceMark,
  type AttendanceMark,
  type AttendanceOccurrenceListRow,
  type AttendanceSheet,
  type AttendanceStatus,
} from '@ramassa/shared/attendance';
import { useAuth } from '@ramassa/shared/auth';
import { isAttendanceCoachCached } from './attendance-coach-cache';
import {
  createAttendanceOutbox,
  nextAttendanceOutboxMark,
  type AttendanceOutboxMark,
} from './attendance-outbox';
import { isNetworkStateOnline } from './network-status';
import { mmkvStorage } from './storage';
import { supabase } from './supabase';

const SIGNED_OUT_QUERY_SCOPE = 'signed-out';

export const attendanceOccurrencesQueryKey = (userId: string) =>
  ['attendance-occurrences', userId] as const;
export const attendanceSheetsQueryKey = (userId: string) => ['attendance-sheet', userId] as const;
export const attendanceSheetQueryKey = (userId: string, occurrenceId: string) =>
  [...attendanceSheetsQueryKey(userId), occurrenceId] as const;

export function useAttendanceOccurrences() {
  const { user, role } = useAuth();
  const canReadAttendance =
    user !== null &&
    (role === 'staff' ||
      role === 'admin' ||
      (role === null && isAttendanceCoachCached(mmkvStorage, user.id)));
  return useQuery<readonly AttendanceOccurrenceListRow[]>({
    queryKey: attendanceOccurrencesQueryKey(user?.id ?? SIGNED_OUT_QUERY_SCOPE),
    queryFn: ({ signal }) => fetchAttendanceOccurrencesForDay(supabase, new Date(), signal),
    enabled: canReadAttendance,
  });
}

export function useAttendanceSheet(occurrenceId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => attendanceSheetQueryKey(userId ?? SIGNED_OUT_QUERY_SCOPE, occurrenceId),
    [occurrenceId, userId],
  );
  const query = useQuery<AttendanceSheet>({
    queryKey,
    queryFn: ({ signal }) => fetchAttendanceSheet(supabase, occurrenceId, signal),
    enabled: userId !== null && occurrenceId.length > 0,
  });

  useEffect(() => {
    if (userId === null || occurrenceId.length === 0) return;
    return subscribeToAttendance(supabase, occurrenceId, (mark) => {
      queryClient.setQueryData<AttendanceSheet>(queryKey, (current) =>
        current === undefined ? current : mergeAttendanceSheetMark(current, mark),
      );
    });
  }, [occurrenceId, queryClient, queryKey, userId]);

  return query;
}

export type AttendanceSyncState = 'pending' | 'retrying' | 'synced';

export function useAttendanceMarker(occurrenceId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => attendanceSheetQueryKey(userId ?? SIGNED_OUT_QUERY_SCOPE, occurrenceId),
    [occurrenceId, userId],
  );
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);
  const outbox = useMemo(
    () => (userId === null ? null : createAttendanceOutbox(mmkvStorage, userId)),
    [userId],
  );
  const readPending = useCallback(() => {
    const byPlayer = new Map<string, AttendanceOutboxMark>();
    for (const entry of outbox?.list() ?? []) {
      if (entry.occurrenceId === occurrenceId) byPlayer.set(entry.playerId, entry);
    }
    return byPlayer;
  }, [occurrenceId, outbox]);
  const [pending, setPending] = useState<ReadonlyMap<string, AttendanceOutboxMark>>(
    () => new Map(),
  );

  useEffect(() => setPending(readPending()), [readPending]);

  const drain = useCallback(async () => {
    if (!isOnline || outbox === null || userId === null) return;
    const result = await outbox.drain(async (entry) => {
      const accepted = await sendAttendanceOutboxMark(entry);
      const acceptedQueryKey = attendanceSheetQueryKey(userId, accepted.occurrence_id);
      queryClient.setQueryData<AttendanceSheet>(acceptedQueryKey, (current) =>
        current === undefined ? current : mergeAttendanceSheetMark(current, accepted),
      );
    });
    if (result.sent > 0) {
      await queryClient.invalidateQueries({ queryKey: attendanceOccurrencesQueryKey(userId) });
    }
    setNextRetryAt(result.nextRetryAt);
    setPending(readPending());
  }, [isOnline, outbox, queryClient, readPending, userId]);

  useEffect(() => {
    if (isOnline) void drain();
  }, [drain, isOnline]);

  useEffect(() => {
    if (!isOnline || nextRetryAt === null) return;
    const timer = setTimeout(() => void drain(), Math.max(0, Date.parse(nextRetryAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [drain, isOnline, nextRetryAt]);

  const mark = useCallback(
    (playerId: string, current: AttendanceStatus | null, currentMarkedAt: string | null) => {
      if (userId === null || outbox === null) return;
      const { status, markedAt } = nextAttendanceOutboxMark(
        readPending().get(playerId),
        current,
        currentMarkedAt,
      );
      const entry = outbox.enqueue({ occurrenceId, playerId, status, markedAt });
      setPending((current) => {
        const next = new Map(current);
        next.set(playerId, entry);
        return next;
      });
      const optimistic: AttendanceMark = {
        id: `local:${occurrenceId}:${playerId}`,
        occurrence_id: occurrenceId,
        player_id: playerId,
        status,
        marked_by: userId,
        marked_at: markedAt,
        updated_at: markedAt,
      };
      queryClient.setQueryData<AttendanceSheet>(queryKey, (sheet) =>
        sheet === undefined ? sheet : mergeAttendanceSheetMark(sheet, optimistic),
      );
      if (isOnline) void drain();
    },
    [drain, isOnline, occurrenceId, outbox, queryClient, queryKey, readPending, userId],
  );

  const syncStateFor = useCallback(
    (playerId: string): AttendanceSyncState => {
      const entry = pending.get(playerId);
      if (entry === undefined) return 'synced';
      return entry.attemptCount > 0 ? 'retrying' : 'pending';
    },
    [pending],
  );

  return { mark, pendingMarks: pending, syncStateFor };
}

export async function sendAttendanceOutboxMark(
  entry: AttendanceOutboxMark,
): Promise<AttendanceMark> {
  return upsertAttendanceMark(supabase, {
    occurrenceId: entry.occurrenceId,
    playerId: entry.playerId,
    status: entry.status,
    markedAt: entry.markedAt,
  });
}
