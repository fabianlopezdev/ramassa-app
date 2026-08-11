import { clearStorageKeys, DEV_STORAGE_GROUPS, groupStorageKeys } from '@/lib/dev/dev-storage';
import { authStorage, preferencesStorage, privateStorage } from '@/lib/storage';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text } from 'react-native';
import { DevButton, DevButtonRow, DevDangerButton, DevNote, DevRow, DevSection } from './dev-ui';

/**
 * Cache controls (RAPP-19 scope item 4).
 *
 * MMKV keys are discovered at runtime, not listed: the modules that own them
 * keep them private, and discovery surfaces keys a later feature adds without
 * anyone remembering to update a catalog. MMKV has no change notification, so
 * the key list is state, re-read after every clear.
 *
 * RAPP-101 split MMKV by sensitivity, so the dev control deliberately inspects
 * and clears all three instances while still showing only key names.
 */
export function DevCacheSection() {
  const queryClient = useQueryClient();
  const storages = [preferencesStorage, authStorage, privateStorage] as const;
  const readStorageKeys = () => storages.flatMap((storage) => storage.getAllKeys());
  const [storageKeys, setStorageKeys] = useState<readonly string[]>(readStorageKeys);
  const [status, setStatus] = useState('');

  const groupedKeys = groupStorageKeys(storageKeys);
  const cachedQueryCount = queryClient.getQueryCache().getAll().length;

  function clearKeys(label: string, keys: readonly string[]) {
    const removedCount = storages.reduce(
      (count, storage) => count + clearStorageKeys(storage, keys),
      0,
    );
    setStorageKeys(readStorageKeys());
    setStatus(`Cleared ${removedCount} ${label} key(s). Reload the app to see the effect.`);
  }

  return (
    <DevSection title="Caches">
      <Text className="text-sm font-semibold text-neutral-700">MMKV</Text>
      {DEV_STORAGE_GROUPS.map((group) => (
        <DevRow
          key={group}
          label={group}
          value={groupedKeys[group].length === 0 ? 'empty' : groupedKeys[group].join(', ')}
        />
      ))}
      <DevButtonRow>
        {DEV_STORAGE_GROUPS.map((group) => (
          <DevButton
            key={group}
            label={`Clear ${group}`}
            onPress={() => clearKeys(group, groupedKeys[group])}
          />
        ))}
        <DevButton label="Re-read keys" onPress={() => setStorageKeys(readStorageKeys())} />
        <DevDangerButton
          label="Clear all MMKV"
          onPress={() => clearKeys('MMKV', readStorageKeys())}
        />
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">React Query</Text>
      <DevRow label="Cached queries" value={String(cachedQueryCount)} />
      <DevButtonRow>
        <DevButton
          label="Invalidate all"
          onPress={() => {
            void queryClient.invalidateQueries();
            setStatus('Invalidated every query.');
          }}
        />
        <DevButton
          label="Refetch all"
          onPress={() => {
            void queryClient.refetchQueries();
            setStatus('Refetched every query.');
          }}
        />
        <DevDangerButton
          label="Clear query cache"
          onPress={() => {
            queryClient.clear();
            setStatus('Cleared the query cache.');
          }}
        />
      </DevButtonRow>
      {status === '' ? null : <DevNote>{status}</DevNote>}
    </DevSection>
  );
}
