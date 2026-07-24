import { devLogBuffer } from '@/lib/dev/dev-instrumentation';
import { filterLogEntries } from '@/lib/dev/dev-log-buffer';
import { logger } from '@/lib/observability';
import { useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { logLevels, type LogLevel } from '@ramassa/shared/logger';
import { DevButton, DevButtonRow, DevNote, DevSection } from './dev-ui';

/**
 * The in-app log viewer (SPEC "Log viewer").
 *
 * Entries arrive through a second sink on the app's real logger, so what shows
 * here is exactly what a feature logged, already PII-redacted, since redaction
 * happens inside the logger before any sink runs. That makes the redaction
 * sample below a live check of the redactor rather than a demo: a value that
 * still looks like a phone number or an email here is a real bug (see RAPP-84).
 */
export function DevLogsSection() {
  const entries = useSyncExternalStore(devLogBuffer.subscribe, devLogBuffer.entries);
  const [minimumLevel, setMinimumLevel] = useState<LogLevel>('debug');

  const visibleEntries = filterLogEntries(entries, minimumLevel);

  return (
    <DevSection title="Logs">
      <DevButtonRow>
        {logLevels.map((level) => (
          <DevButton
            key={level}
            label={level}
            isActive={level === minimumLevel}
            onPress={() => setMinimumLevel(level)}
          />
        ))}
      </DevButtonRow>
      <DevButtonRow>
        <DevButton
          label="Log a redaction sample"
          onPress={() =>
            logger.info('dev redaction sample', {
              email: 'amina.alhassan@example.test',
              phone: '+34 600 123 456',
              userId: '5eed0000-0000-4000-8000-000000000011',
            })
          }
        />
        <DevButton label="Clear" onPress={devLogBuffer.clear} />
      </DevButtonRow>
      {visibleEntries.length === 0 ? (
        <DevNote>No entries at this level.</DevNote>
      ) : (
        visibleEntries.map((entry) => (
          <View key={entry.id} className="gap-xs border-b border-neutral-100 py-xs">
            <Text className="text-sm font-medium text-neutral-900">
              {`[${entry.level}] ${entry.message}`}
            </Text>
            <Text selectable className="text-xs text-neutral-500">
              {JSON.stringify(entry.context)}
            </Text>
          </View>
        ))
      )}
    </DevSection>
  );
}
