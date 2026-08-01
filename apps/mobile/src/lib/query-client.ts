import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single React Query client (added with RAPP-19 so the dev menu's
 * cache controls have something real to drive).
 *
 * Created at module scope, once per app load: a client built inside a component
 * would be replaced on every re-render and silently drop the cache.
 *
 * Defaults are deliberately conservative for this audience. Players are on
 * low-end Android over patchy mobile data (SPEC), so a failed request retries
 * once rather than hammering the connection, and cached data stays fresh long
 * enough that returning to a screen does not refetch. Feature issues tune this
 * per query as real screens arrive (RAPP-33 onward); offline persistence is
 * RAPP-65's job, not a default here.
 */

const STALE_TIME_MS = 60_000;
const RETRY_COUNT = 1;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: STALE_TIME_MS, retry: RETRY_COUNT },
    mutations: { retry: 0 },
  },
});
