import { QueryClient } from '@tanstack/react-query';
import { isRetryableError } from '@ramassa/shared/errors';
import { configureNetworkStatus } from './network-status';
import { ANNOUNCEMENT_CACHE_MAX_AGE_MS, createQueryPersister } from './query-persistence';
import { mmkvStorage } from './storage';

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
 * per query as real screens arrive. RAPP-33 persists only the public
 * announcement feed; decrypted profile rows are deliberately excluded.
 *
 * The retry is CONDITIONAL, not a count. A flat `retry: 1` also retried the
 * failures a second attempt cannot fix — an expired session, a rejected input,
 * a record that is simply not there — and every one of those spends the two
 * things this audience has least of: seconds in front of a stuck screen, and
 * mobile data. Which codes those are is a property of the taxonomy, so the rule
 * lives with it (`isRetryableError`) and the admin app answers the same way.
 */

const STALE_TIME_MS = 60_000;
const MAX_QUERY_ATTEMPTS_AFTER_THE_FIRST = 1;

configureNetworkStatus();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      gcTime: ANNOUNCEMENT_CACHE_MAX_AGE_MS,
      retry: (failureCount, error) =>
        failureCount < MAX_QUERY_ATTEMPTS_AFTER_THE_FIRST && isRetryableError(error),
    },
    // Writes are never retried automatically: this app's mutations are profile
    // edits and RGPD requests, and a silent second attempt at "please erase my
    // data" is not a retry, it is a second request.
    mutations: { retry: 0 },
  },
});

export const queryPersister = createQueryPersister(mmkvStorage);
