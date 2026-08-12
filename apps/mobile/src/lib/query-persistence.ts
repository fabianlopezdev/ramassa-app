import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const QUERY_CACHE_STORAGE_KEY = 'ramassa.query-cache.v1';
const QUERY_CACHE_BUSTER = 'player-content-v6-forum-user-scoped';
const PLAYER_ANNOUNCEMENTS_QUERY_ROOT = 'player-announcements';
const PLAYER_EVENTS_QUERY_ROOT = 'player-events';
const PLAYER_KNOWLEDGE_QUERY_ROOT = 'player-knowledge';
const PLAYER_SERVICES_QUERY_ROOT = 'player-services';
const PLAYER_FORUM_QUERY_ROOT = 'player-forum';

export const ANNOUNCEMENT_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export interface QueryCacheStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

export function createQueryPersister(storage: QueryCacheStorage): Persister {
  return {
    persistClient: (client: PersistedClient) => {
      storage.set(QUERY_CACHE_STORAGE_KEY, JSON.stringify(client));
    },
    restoreClient: () => {
      const serialized = storage.getString(QUERY_CACHE_STORAGE_KEY);
      if (serialized === undefined) return undefined;
      try {
        return JSON.parse(serialized) as PersistedClient;
      } catch {
        storage.remove(QUERY_CACHE_STORAGE_KEY);
        return undefined;
      }
    },
    removeClient: () => {
      storage.remove(QUERY_CACHE_STORAGE_KEY);
    },
  };
}

/**
 * Seeds a detail query from a cached list without making old persisted data
 * look newly fetched. React Query otherwise timestamps `initialData` at the
 * moment the detail mounts, which can suppress the online refresh of a list
 * restored from disk up to a week earlier.
 */
export function cachedListItemInitialDataOptions<T extends { readonly id: string }>(
  queryClient: QueryClient,
  listQueryKey: QueryKey,
  itemId: string,
) {
  return {
    initialData: () =>
      queryClient
        .getQueryData<readonly T[]>(listQueryKey)
        ?.find((candidate) => candidate.id === itemId),
    initialDataUpdatedAt: () => queryClient.getQueryState(listQueryKey)?.dataUpdatedAt,
  };
}

function shouldPersistQuery(query: Query): boolean {
  return (
    (query.queryKey[0] === PLAYER_ANNOUNCEMENTS_QUERY_ROOT ||
      query.queryKey[0] === PLAYER_EVENTS_QUERY_ROOT ||
      query.queryKey[0] === PLAYER_KNOWLEDGE_QUERY_ROOT ||
      query.queryKey[0] === PLAYER_SERVICES_QUERY_ROOT ||
      query.queryKey[0] === PLAYER_FORUM_QUERY_ROOT) &&
    query.state.status === 'success'
  );
}

/**
 * Persistence is intentionally allowlisted to player-facing organization
 * content and the caller's signup state. Every key is user-scoped. The same
 * QueryClient also holds a participant's decrypted profile, which must never
 * be serialized into the unencrypted MMKV instance.
 */
export function persistedQueryOptions(persister: Persister) {
  return {
    persister,
    maxAge: ANNOUNCEMENT_CACHE_MAX_AGE_MS,
    buster: QUERY_CACHE_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
}
