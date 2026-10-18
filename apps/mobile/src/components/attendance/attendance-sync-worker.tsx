import {
  attendanceOccurrencesQueryKey,
  attendanceSheetsQueryKey,
  sendAttendanceOutboxMark,
} from '@/lib/attendance';
import { createAttendanceOutbox } from '@/lib/attendance-outbox';
import { isNetworkStateOnline } from '@/lib/network-status';
import { startDrainLoop } from '@/lib/outbox-drain-loop';
import { privateStorage } from '@/lib/storage';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';

/**
 * Drains persisted marks on cold start, reconnect, each persisted retry
 * deadline and a steady tick, so a failed send from the sheet is retried too
 * (RAPP-530).
 */
export function AttendanceSyncWorker({ userId }: { readonly userId: string }) {
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    const outbox = createAttendanceOutbox(privateStorage, userId);
    return startDrainLoop(async () => {
      const result = await outbox.drain(async (entry) => {
        await sendAttendanceOutboxMark(entry);
      });
      if (result.sent > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: attendanceSheetsQueryKey(userId) }),
          queryClient.invalidateQueries({ queryKey: attendanceOccurrencesQueryKey(userId) }),
        ]);
      }
      return result;
    });
  }, [isOnline, queryClient, userId]);

  return null;
}
