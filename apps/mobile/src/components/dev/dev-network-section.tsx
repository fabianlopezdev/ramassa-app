import { devNetworkLog } from '@/lib/dev/dev-instrumentation';
import { useIsOnline } from '@/lib/use-is-online';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { DevButton, DevButtonRow, DevNote, DevSection } from './dev-ui';

/**
 * The network inspector (RAPP-19 scope item 5, SPEC "Network inspector").
 *
 * Fed by a `fetch` wrapper installed at app boot, so it holds everything since
 * cold start, not just what happened after the menu opened. URLs arrive already
 * redacted: a magic-link callback carries a live access token in its query
 * string and this screen gets screenshotted.
 *
 * "Simulate offline" (RAPP-817) flips the app's one online state, so the offline
 * strip and every paused request can be seen on a simulator whose local backend
 * always counts as reachable. It lasts until it is switched back or the app
 * reloads.
 */
export function DevNetworkSection() {
  const entries = useSyncExternalStore(devNetworkLog.subscribe, devNetworkLog.entries);
  const isOnline = useIsOnline();

  return (
    <DevSection title="Network">
      <DevNote>
        Phase 1 traffic is auth, the profiles role lookup, and push-token writes. R2 uploads appear
        here once Phase 3 adds them.
      </DevNote>
      <DevButtonRow>
        <DevButton label="Clear" onPress={devNetworkLog.clear} />
        <DevButton
          testID="dev-simulate-offline"
          label={isOnline ? 'Simulate offline' : 'Back online'}
          isActive={!isOnline}
          onPress={() => onlineManager.setOnline(!isOnline)}
        />
      </DevButtonRow>
      {entries.length === 0 ? (
        <DevNote>Nothing captured yet.</DevNote>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} className="gap-xs border-b border-neutral-100 py-xs">
            <Text className="text-sm font-medium text-neutral-900">
              {`${entry.method} ${entry.failed ? 'FAILED' : (entry.status ?? '?')} · ${
                entry.durationMs
              }ms · ${entry.kind}`}
            </Text>
            <Text selectable className="text-xs text-neutral-500">
              {entry.url}
            </Text>
          </View>
        ))
      )}
    </DevSection>
  );
}
