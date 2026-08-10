import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { afterEach, expect, test } from 'bun:test';
import {
  ANNOUNCEMENT_CACHE_MAX_AGE_MS,
  cachedListItemInitialDataOptions,
  createQueryPersister,
  persistedQueryOptions,
} from './query-persistence';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => void values.set(key, value),
    remove: (key: string) => values.delete(key),
    raw: values,
  };
}

afterEach(() => onlineManager.setOnline(true));

test('airplane mode restores and renders the cached feed without fetching', async () => {
  const storage = memoryStorage();
  const persister = createQueryPersister(storage);
  const source = new QueryClient({
    defaultOptions: { queries: { gcTime: ANNOUNCEMENT_CACHE_MAX_AGE_MS } },
  });
  const cachedFeed = [{ id: 'cached-announcement', title: { ca: 'Des de la memòria' } }];
  source.setQueryData(['player-announcements', 'player-a'], cachedFeed);

  await persistQueryClientSave({ queryClient: source, ...persistedQueryOptions(persister) });

  const restored = new QueryClient({
    defaultOptions: { queries: { gcTime: ANNOUNCEMENT_CACHE_MAX_AGE_MS, retry: false } },
  });
  await persistQueryClientRestore({ queryClient: restored, ...persistedQueryOptions(persister) });
  onlineManager.setOnline(false);

  let networkCalls = 0;
  const observer = new QueryObserver<readonly { id: string; title: { ca: string } }[]>(restored, {
    queryKey: ['player-announcements', 'player-a'],
    queryFn: async () => {
      networkCalls += 1;
      throw new Error('the radio must stay quiet in airplane mode');
    },
  });
  const stop = observer.subscribe(() => undefined);

  expect(observer.getCurrentResult().data).toEqual(cachedFeed);
  expect(observer.getCurrentResult().status).toBe('success');
  expect(observer.getCurrentResult().fetchStatus).toBe('paused');
  expect(networkCalls).toBe(0);
  stop();
});

test('a restored feed is visible only to the user who cached it', async () => {
  const storage = memoryStorage();
  const persister = createQueryPersister(storage);
  const source = new QueryClient();
  source.setQueryData(['player-announcements', 'player-a'], [{ id: 'organization-a' }]);

  await persistQueryClientSave({ queryClient: source, ...persistedQueryOptions(persister) });

  const restored = new QueryClient();
  await persistQueryClientRestore({ queryClient: restored, ...persistedQueryOptions(persister) });

  expect(
    restored.getQueryData<readonly { id: string }[]>(['player-announcements', 'player-a']),
  ).toEqual([{ id: 'organization-a' }]);
  expect(
    restored.getQueryData<readonly { id: string }[]>(['player-announcements', 'player-b']),
  ).toBeUndefined();
});

test('persistence excludes decrypted profile data and keeps only the public feed', async () => {
  const storage = memoryStorage();
  const persister = createQueryPersister(storage);
  const client = new QueryClient();
  client.setQueryData(['own-profile'], { document_number: 'X1234567' });
  client.setQueryData(['player-announcements', 'player-a'], [{ id: 'safe-public-content' }]);
  client.setQueryData(
    ['player-events', 'player-a'],
    [{ occurrence_id: 'cached-event', signup: { state: 'confirmed' } }],
  );

  await persistQueryClientSave({ queryClient: client, ...persistedQueryOptions(persister) });

  const serialized = [...storage.raw.values()].join('');
  expect(serialized).toContain('safe-public-content');
  expect(serialized).toContain('cached-event');
  expect(serialized).not.toContain('X1234567');
  expect(serialized).not.toContain('own-profile');
});

test('airplane mode restores the player calendar without a network request', async () => {
  const storage = memoryStorage();
  const persister = createQueryPersister(storage);
  const source = new QueryClient();
  const cachedEvents = [{ occurrence_id: 'event-from-cache' }];
  source.setQueryData(['player-events', 'player-a'], cachedEvents);

  await persistQueryClientSave({ queryClient: source, ...persistedQueryOptions(persister) });

  const restored = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await persistQueryClientRestore({ queryClient: restored, ...persistedQueryOptions(persister) });
  onlineManager.setOnline(false);
  let networkCalls = 0;
  const observer = new QueryObserver<readonly { occurrence_id: string }[]>(restored, {
    queryKey: ['player-events', 'player-a'],
    queryFn: async () => {
      networkCalls += 1;
      throw new Error('the calendar must use its persisted rows');
    },
  });
  const stop = observer.subscribe(() => undefined);

  expect(observer.getCurrentResult().data).toEqual(cachedEvents);
  expect(observer.getCurrentResult().fetchStatus).toBe('paused');
  expect(networkCalls).toBe(0);
  stop();
});

test('airplane mode restores published knowledge and the signed-in player own story states', async () => {
  const storage = memoryStorage();
  const persister = createQueryPersister(storage);
  const source = new QueryClient();
  source.setQueryData(['player-knowledge', 'articles', 'player-a'], [{ id: 'cached-resource' }]);
  source.setQueryData(
    ['player-knowledge', 'own-stories', 'player-a'],
    [{ id: 'own-pending-story', story_status: 'submitted' }],
  );

  await persistQueryClientSave({ queryClient: source, ...persistedQueryOptions(persister) });

  const restored = new QueryClient();
  await persistQueryClientRestore({ queryClient: restored, ...persistedQueryOptions(persister) });

  expect(
    restored.getQueryData<readonly { id: string }[]>(['player-knowledge', 'articles', 'player-a']),
  ).toEqual([{ id: 'cached-resource' }]);
  expect(
    restored.getQueryData<readonly { id: string; story_status: string }[]>([
      'player-knowledge',
      'own-stories',
      'player-a',
    ]),
  ).toEqual([{ id: 'own-pending-story', story_status: 'submitted' }]);
  expect(restored.getQueryData(['player-knowledge', 'own-stories', 'player-b'])).toBeUndefined();
});

test('airplane mode restores the signed-in player service directory and interests', async () => {
  const storage = memoryStorage();
  const persister = createQueryPersister(storage);
  const source = new QueryClient();
  const cachedServices = [{ id: 'cached-service', interested: true }];
  source.setQueryData(
    ['player-services', 'list', 'player-a', 'housing', 'unfiltered'],
    cachedServices,
  );

  await persistQueryClientSave({ queryClient: source, ...persistedQueryOptions(persister) });

  const restored = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await persistQueryClientRestore({ queryClient: restored, ...persistedQueryOptions(persister) });
  onlineManager.setOnline(false);
  let networkCalls = 0;
  const observer = new QueryObserver<readonly { id: string; interested: boolean }[]>(restored, {
    queryKey: ['player-services', 'list', 'player-a', 'housing', 'unfiltered'],
    queryFn: async () => {
      networkCalls += 1;
      throw new Error('the service directory must use its persisted rows');
    },
  });
  const stop = observer.subscribe(() => undefined);

  expect(observer.getCurrentResult().data).toEqual(cachedServices);
  expect(observer.getCurrentResult().fetchStatus).toBe('paused');
  expect(networkCalls).toBe(0);
  expect(
    restored.getQueryData(['player-services', 'list', 'player-b', 'housing', 'unfiltered']),
  ).toBeUndefined();
  stop();
});

test('a detail seeded from a restored list inherits the list age and refreshes when online', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const listQueryKey = ['player-knowledge', 'articles', 'player-a'] as const;
  const detailQueryKey = ['player-knowledge', 'detail', 'player-a', 'cached-resource'] as const;
  client.setQueryData(listQueryKey, [{ id: 'cached-resource', title: 'cached title' }], {
    updatedAt: Date.now() - 120_000,
  });

  let networkCalls = 0;
  const observer = new QueryObserver<{ readonly id: string; readonly title: string }>(client, {
    queryKey: detailQueryKey,
    queryFn: async () => {
      networkCalls += 1;
      return { id: 'cached-resource', title: 'fresh title' };
    },
    staleTime: 60_000,
    ...cachedListItemInitialDataOptions<{ readonly id: string; readonly title: string }>(
      client,
      listQueryKey,
      'cached-resource',
    ),
  });

  expect(observer.getCurrentResult().data?.title).toBe('cached title');
  const stop = observer.subscribe(() => undefined);
  await Bun.sleep(20);

  expect(networkCalls).toBe(1);
  expect(observer.getCurrentResult().data?.title).toBe('fresh title');
  stop();
});
