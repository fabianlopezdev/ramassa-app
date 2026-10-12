import { drainHandovers } from '@/lib/handover';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';

/** Sends waiting handovers on cold start, on reconnect, and at each retry time (RAPP-249). */
export function HandoverSyncWorker({ userId }: { readonly userId: string }) {
  const isOnline = isNetworkStateOnline(useNetworkState());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const drain = async () => {
      const { nextRetryAt } = await drainHandovers(userId, queryClient);
      if (cancelled || nextRetryAt === null) return;
      timer = setTimeout(drain, Math.max(0, Date.parse(nextRetryAt) - Date.now()));
    };
    void drain();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isOnline, queryClient, userId]);

  return null;
}
