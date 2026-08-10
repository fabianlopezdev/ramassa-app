import {
  attendanceOccurrencesQueryKey,
  attendanceSheetsQueryKey,
  sendAttendanceOutboxMark,
} from '@/lib/attendance';
import { createAttendanceOutbox } from '@/lib/attendance-outbox';
import { isNetworkStateOnline } from '@/lib/network-status';
import { mmkvStorage } from '@/lib/storage';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';

/** Drains persisted marks on cold start, reconnect, and each persisted retry deadline. */
export function AttendanceSyncWorker({ userId }: { readonly userId: string }) {
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    const outbox = createAttendanceOutbox(mmkvStorage, userId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const drain = async () => {
      const result = await outbox.drain(async (entry) => {
        await sendAttendanceOutboxMark(entry);
      });
      if (cancelled) return;
      if (result.sent > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: attendanceSheetsQueryKey(userId) }),
          queryClient.invalidateQueries({ queryKey: attendanceOccurrencesQueryKey(userId) }),
        ]);
      }
      if (cancelled) return;
      if (result.nextRetryAt !== null) {
        timer = setTimeout(drain, Math.max(0, Date.parse(result.nextRetryAt) - Date.now()));
      }
    };
    void drain();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isOnline, queryClient, userId]);

  return null;
}
