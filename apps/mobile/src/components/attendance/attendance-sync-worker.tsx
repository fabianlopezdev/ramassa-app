import { sendAttendanceOutboxMark } from '@/lib/attendance';
import { isAttendanceCoachCached } from '@/lib/attendance-coach-cache';
import { createAttendanceOutbox } from '@/lib/attendance-outbox';
import { isNetworkStateOnline } from '@/lib/network-status';
import { mmkvStorage } from '@/lib/storage';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';
import { useAuth } from '@ramassa/shared/auth';

/** Drains persisted marks on cold start, reconnect, and each persisted retry deadline. */
export function AttendanceSyncWorker() {
  const { user, role } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();

  useEffect(() => {
    const canMarkAttendance =
      user !== null &&
      (role === 'staff' ||
        role === 'admin' ||
        (role === null && isAttendanceCoachCached(mmkvStorage, user.id)));
    if (user === null || !canMarkAttendance || !isOnline) return;
    const outbox = createAttendanceOutbox(mmkvStorage, user.id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const drain = async () => {
      const result = await outbox.drain(async (entry) => {
        await sendAttendanceOutboxMark(entry);
      });
      if (cancelled) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-sheet'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-occurrences'] }),
      ]);
      if (result.nextRetryAt !== null) {
        timer = setTimeout(drain, Math.max(0, Date.parse(result.nextRetryAt) - Date.now()));
      }
    };
    void drain();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isOnline, queryClient, role, user]);

  return null;
}
