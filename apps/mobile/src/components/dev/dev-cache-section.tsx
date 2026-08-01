import { clearStorageKeys, DEV_STORAGE_GROUPS, groupStorageKeys } from '@/lib/dev/dev-storage';
import { mmkvStorage } from '@/lib/storage';
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
 * The React Query side is live but empty on purpose. `@tanstack/react-query`
 * arrived with this issue; the first screens that actually query land in Phase 3
 * (RAPP-33, RAPP-34), so today the counter reads 0 and clearing is a no-op. It
 * is wired now so the control exists the moment a query does.
 */
export function DevCacheSection() {
  const queryClient = useQueryClient();
  const [storageKeys, setStorageKeys] = useState<readonly string[]>(() => mmkvStorage.getAllKeys());
  const [status, setStatus] = useState('');

  const groupedKeys = groupStorageKeys(storageKeys);
  const cachedQueryCount = queryClient.getQueryCache().getAll().length;

  function clearKeys(label: string, keys: readonly string[]) {
    const removedCount = clearStorageKeys(mmkvStorage, keys);
    setStorageKeys(mmkvStorage.getAllKeys());
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
        <DevButton label="Re-read keys" onPress={() => setStorageKeys(mmkvStorage.getAllKeys())} />
        <DevDangerButton
          label="Clear all MMKV"
          onPress={() => clearKeys('MMKV', mmkvStorage.getAllKeys())}
        />
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">React Query</Text>
      <DevRow label="Cached queries" value={String(cachedQueryCount)} />
      <DevNote>No screen queries yet; the first ones land in Phase 3 (RAPP-33, RAPP-34).</DevNote>
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
