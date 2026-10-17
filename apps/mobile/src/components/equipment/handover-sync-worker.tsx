import { drainHandovers } from '@/lib/handover';
import { isNetworkStateOnline } from '@/lib/network-status';
import { startDrainLoop } from '@/lib/outbox-drain-loop';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';

/**
 * Sends waiting handovers on cold start, on reconnect, at each retry time and
 * on a steady tick, so a failed send from the handover screen is retried too
 * (RAPP-249, RAPP-530).
 */
export function HandoverSyncWorker({ userId }: { readonly userId: string }) {
  const isOnline = isNetworkStateOnline(useNetworkState());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    return startDrainLoop(() => drainHandovers(userId, queryClient));
  }, [isOnline, queryClient, userId]);

  return null;
}
