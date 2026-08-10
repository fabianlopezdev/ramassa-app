import { PressableScale } from '@/components/motion/pressable-scale';
import type { AttendanceSyncState } from '@/lib/attendance';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import type { AttendanceStatus } from '@ramassa/shared/attendance';
import { tokens } from '@ramassa/shared/tokens';

const statusSymbols: Record<AttendanceStatus | 'unmarked', SymbolViewProps['name']> = {
  unmarked: { ios: 'circle', android: 'radio_button_unchecked', web: 'circle' },
  present: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  absent: { ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' },
  excused: { ios: 'questionmark.circle.fill', android: 'help', web: 'help' },
};

const statusColors: Record<AttendanceStatus | 'unmarked', string> = {
  unmarked: tokens.colors.neutral[500],
  present: tokens.colors.success,
  absent: tokens.colors.error,
  excused: tokens.colors.warning,
};

export function attendanceStatusKey(status: AttendanceStatus | null) {
  if (status === null) return 'statusUnmarked' as const;
  if (status === 'present') return 'statusPresent' as const;
  if (status === 'absent') return 'statusAbsent' as const;
  return 'statusExcused' as const;
}

export function attendanceSyncKey(state: AttendanceSyncState) {
  if (state === 'pending') return 'syncPending' as const;
  if (state === 'retrying') return 'syncRetrying' as const;
  return 'syncSynced' as const;
}

interface AttendanceRowProps {
  readonly playerId: string;
  readonly name: string;
  readonly signedUp: boolean;
  readonly status: AttendanceStatus | null;
  readonly markedAt: string | null;
  readonly syncState: AttendanceSyncState;
  readonly accessibilityLabel: string;
  readonly statusLabel: string;
  readonly signedUpLabel: string;
  readonly syncLabel: string;
  readonly languageFontClass: string;
  readonly onMark: (
    playerId: string,
    status: AttendanceStatus | null,
    markedAt: string | null,
  ) => void;
}

export const AttendanceRow = memo(function AttendanceRow({
  playerId,
  name,
  signedUp,
  status,
  markedAt,
  syncState,
  accessibilityLabel,
  statusLabel,
  signedUpLabel,
  syncLabel,
  languageFontClass,
  onMark,
}: AttendanceRowProps) {
  const handlePress = useCallback(
    () => onMark(playerId, status, markedAt),
    [markedAt, onMark, playerId, status],
  );
  const visualStatus = status ?? 'unmarked';

  return (
    <PressableScale
      testID={`attendance-player-${playerId}`}
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      haptic="selection"
      className="min-h-3xl flex-row items-center gap-md border-b border-neutral-200 bg-white px-lg py-md"
    >
      <SymbolView
        accessible={false}
        name={statusSymbols[visualStatus]}
        size={tokens.fontSize['3xl']}
        tintColor={statusColors[visualStatus]}
      />
      <View className="flex-1 gap-xs">
        <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
          {name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-sm">
          <Text
            testID={`attendance-status-${playerId}-${visualStatus}`}
            className={`text-start text-sm font-semibold text-neutral-800 ${languageFontClass}`}
          >
            {statusLabel}
          </Text>
          {signedUp ? (
            <Text className={`text-start text-xs text-neutral-600 ${languageFontClass}`}>
              {signedUpLabel}
            </Text>
          ) : null}
        </View>
        {status !== null || syncState !== 'synced' ? (
          <Text
            testID={`attendance-sync-${playerId}-${syncState}`}
            accessibilityLiveRegion="polite"
            className={`text-start text-xs text-neutral-600 ${languageFontClass}`}
          >
            {syncLabel}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
});
