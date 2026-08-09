import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAttendanceOccurrencesForDay,
  fetchAttendanceSheet,
  mergeAttendanceMark,
  nextAttendanceMarkedAt,
  nextAttendanceStatus,
  subscribeToAttendance,
  upsertAttendanceMark,
  type AttendanceMark,
  type AttendanceOccurrenceListRow,
  type AttendanceSheet,
  type AttendanceStatus,
} from '@ramassa/shared/attendance';
import { useAuth } from '@ramassa/shared/auth';
import { isAttendanceCoachCached } from './attendance-coach-cache';
import { createAttendanceOutbox, type AttendanceOutboxMark } from './attendance-outbox';
import { isNetworkStateOnline } from './network-status';
import { mmkvStorage } from './storage';
import { supabase } from './supabase';

export const attendanceOccurrencesQueryKey = (userId: string) =>
  ['attendance-occurrences', userId] as const;
export const attendanceSheetQueryKey = (userId: string, occurrenceId: string) =>
  ['attendance-sheet', userId, occurrenceId] as const;

export function useAttendanceOccurrences() {
  const { user, role } = useAuth();
  const canReadAttendance =
    user !== null &&
    (role === 'staff' ||
      role === 'admin' ||
      (role === null && isAttendanceCoachCached(mmkvStorage, user.id)));
  return useQuery<readonly AttendanceOccurrenceListRow[]>({
    queryKey: attendanceOccurrencesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchAttendanceOccurrencesForDay(supabase, new Date(), signal),
    enabled: canReadAttendance,
  });
}

function withMark(sheet: AttendanceSheet, incoming: AttendanceMark): AttendanceSheet {
  return {
    ...sheet,
    participants: sheet.participants.map((participant) => {
      if (participant.id !== incoming.player_id) return participant;
      return {
        ...participant,
        mark:
          participant.mark === null ? incoming : mergeAttendanceMark(participant.mark, incoming),
      };
    }),
  };
}

export function useAttendanceSheet(occurrenceId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => attendanceSheetQueryKey(user?.id ?? 'signed-out', occurrenceId),
    [occurrenceId, user?.id],
  );
  const query = useQuery<AttendanceSheet>({
    queryKey,
    queryFn: ({ signal }) => fetchAttendanceSheet(supabase, occurrenceId, signal),
    enabled: user !== null && occurrenceId.length > 0,
  });

  useEffect(
    () =>
      subscribeToAttendance(supabase, occurrenceId, (mark) => {
        queryClient.setQueryData<AttendanceSheet>(queryKey, (current) =>
          current === undefined ? current : withMark(current, mark),
        );
      }),
    [occurrenceId, queryClient, queryKey],
  );

  return query;
}

export type AttendanceSyncState = 'pending' | 'retrying' | 'synced';

export function useAttendanceMarker(occurrenceId: string) {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => attendanceSheetQueryKey(user?.id ?? 'signed-out', occurrenceId),
    [occurrenceId, user?.id],
  );
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);
  const outbox = useMemo(
    () => (user === null ? null : createAttendanceOutbox(mmkvStorage, user.id)),
    [user],
  );
  const readPending = useCallback(
    () =>
      new Map(
        (outbox?.list() ?? [])
          .filter((entry) => entry.occurrenceId === occurrenceId)
          .map((entry) => [entry.playerId, entry]),
      ),
    [occurrenceId, outbox],
  );
  const [pending, setPending] = useState<ReadonlyMap<string, AttendanceOutboxMark>>(
    () => new Map(),
  );

  useEffect(() => setPending(readPending()), [readPending]);

  const drain = useCallback(async () => {
    if (!isOnline || outbox === null) return;
    const result = await outbox.drain(async (entry) => {
      const accepted = await sendAttendanceOutboxMark(entry);
      queryClient.setQueryData<AttendanceSheet>(queryKey, (current) =>
        current === undefined ? current : withMark(current, accepted),
      );
    });
    setNextRetryAt(result.nextRetryAt);
    setPending(readPending());
  }, [isOnline, outbox, queryClient, queryKey, readPending]);

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
      if (user === null || outbox === null) return;
      const status = nextAttendanceStatus(current);
      const markedAt = nextAttendanceMarkedAt(pending.get(playerId)?.markedAt ?? currentMarkedAt);
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
        marked_by: user.id,
        marked_at: markedAt,
        updated_at: markedAt,
      };
      queryClient.setQueryData<AttendanceSheet>(queryKey, (sheet) =>
        sheet === undefined ? sheet : withMark(sheet, optimistic),
      );
      if (isOnline) void drain();
    },
    [drain, isOnline, occurrenceId, outbox, pending, queryClient, queryKey, user],
  );

  const syncStateFor = useCallback(
    (playerId: string): AttendanceSyncState => {
      const entry = pending.get(playerId);
      if (entry === undefined) return 'synced';
      return entry.attemptCount > 0 ? 'retrying' : 'pending';
    },
    [pending],
  );

  return { mark, syncStateFor, pendingCount: pending.size };
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
