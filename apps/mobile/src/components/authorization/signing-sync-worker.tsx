import { isNetworkStateOnline } from '@/lib/network-status';
import { drainSignings } from '@/lib/tablet-signing';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';

/** Sends signings waiting on this tablet on cold start, on reconnect, and at each retry time (RAPP-305). */
export function SigningSyncWorker({ userId }: { readonly userId: string }) {
  const isOnline = isNetworkStateOnline(useNetworkState());

  useEffect(() => {
    if (!isOnline) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const drain = async () => {
      const { nextRetryAt } = await drainSignings(userId);
      if (cancelled || nextRetryAt === null) return;
      timer = setTimeout(drain, Math.max(0, Date.parse(nextRetryAt) - Date.now()));
    };
    void drain();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isOnline, userId]);

  return null;
}
