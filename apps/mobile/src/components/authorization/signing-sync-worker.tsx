import { isNetworkStateOnline } from '@/lib/network-status';
import { startDrainLoop } from '@/lib/outbox-drain-loop';
import { drainSignings } from '@/lib/tablet-signing';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';

/**
 * Sends signings waiting on this tablet on cold start, on reconnect, at each
 * retry time and on a steady tick, so a failed send from signing mode is
 * retried too (RAPP-305, RAPP-530).
 */
export function SigningSyncWorker({ userId }: { readonly userId: string }) {
  const isOnline = isNetworkStateOnline(useNetworkState());

  useEffect(() => {
    if (!isOnline) return;
    return startDrainLoop(() => drainSignings(userId));
  }, [isOnline, userId]);

  return null;
}
