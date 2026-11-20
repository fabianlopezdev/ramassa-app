import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Icon, type IconName, type IconWeight } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import type { AttendanceSyncState } from '@/lib/attendance';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import type { AttendanceStatus } from '@ramassa/shared/attendance';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';

// An empty ring while nobody is marked; a filled two-tone mark once she is.
// Shared with her own history on La meva assistència (RAPP-896).
export const attendanceStatusIcons: Record<
  AttendanceStatus | 'unmarked',
  { readonly name: IconName; readonly weight: IconWeight }
> = {
  unmarked: { name: 'circle', weight: 'linear' },
  present: { name: 'check-circle', weight: 'boldDuotone' },
  absent: { name: 'close-circle', weight: 'boldDuotone' },
  excused: { name: 'question-circle', weight: 'boldDuotone' },
};

// Her card, from a separate control beside the row (RAPP-799).

export const attendanceStatusColors: Record<AttendanceStatus | 'unmarked', string> = {
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

export function attendanceSyncKey(state: AttendanceSyncState, rejection: AppErrorCode | null) {
  if (state === 'pending') return 'syncPending' as const;
  if (state === 'retrying') return 'syncRetrying' as const;
  if (state === 'rejected') {
    return rejection === 'AUTH-3' ? ('syncRejectedPermission' as const) : ('syncRejected' as const);
  }
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
  /** Shown only for a refused mark (RAPP-237). */
  readonly retryLabel: string;
  readonly discardLabel: string;
  readonly onRetry: (playerId: string) => void;
  readonly onDiscard: (playerId: string) => void;
  /** Present only for a reader who may open participant cards. */
  readonly onOpenCard?: (playerId: string) => void;
  readonly openCardLabel: string;
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
  retryLabel,
  discardLabel,
  onRetry,
  onDiscard,
  onOpenCard,
  openCardLabel,
  onMark,
}: AttendanceRowProps) {
  const handlePress = useCallback(
    () => onMark(playerId, status, markedAt),
    [markedAt, onMark, playerId, status],
  );
  const handleRetry = useCallback(() => onRetry(playerId), [onRetry, playerId]);
  const handleDiscard = useCallback(() => onDiscard(playerId), [onDiscard, playerId]);
  const handleOpenCard = useCallback(() => onOpenCard?.(playerId), [onOpenCard, playerId]);
  const visualStatus = status ?? 'unmarked';

  return (
    <View className="gap-sm px-lg pb-md">
      <View className="flex-row items-stretch gap-sm">
        <SelectionChoiceSurface
          testID={`attendance-player-${playerId}`}
          label={accessibilityLabel}
          onPress={handlePress}
          className="flex-1"
          contentClassName="grow flex-row items-center gap-md py-md"
        >
          <Icon
            name={attendanceStatusIcons[visualStatus].name}
            weight={attendanceStatusIcons[visualStatus].weight}
            size={tokens.fontSize['3xl']}
            color={attendanceStatusColors[visualStatus]}
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
                className={`text-start text-xs ${
                  syncState === 'rejected' ? 'font-semibold text-error' : 'text-neutral-600'
                } ${languageFontClass}`}
              >
                {syncLabel}
              </Text>
            ) : null}
          </View>
        </SelectionChoiceSurface>
        {onOpenCard === undefined ? null : (
          // Beside the row, outside its pressable: a tap on the row still cycles the mark.
          <SelectionChoiceSurface
            testID={`attendance-open-card-${playerId}`}
            label={openCardLabel}
            onPress={handleOpenCard}
            paddingClassName="px-md"
            contentClassName="grow items-center justify-center"
          >
            <Icon
              name="id-card"
              weight="boldDuotone"
              size={tokens.fontSize['2xl']}
              color={tokens.colors.primary.dark}
            />
          </SelectionChoiceSurface>
        )}
      </View>
      {syncState === 'rejected' ? (
        // Outside the row's pressable: a tap on the row cycles the status, and
        // these two act on the refused change itself.
        <View
          testID={`attendance-rejected-${playerId}`}
          className="flex-row flex-wrap items-center gap-sm"
        >
          <RaisedActionButton
            testID={`attendance-retry-${playerId}`}
            label={retryLabel}
            accessibilityLabel={`${retryLabel}: ${name}`}
            onPress={handleRetry}
          />
          <PressableScale
            testID={`attendance-discard-${playerId}`}
            accessibilityRole="button"
            accessibilityLabel={`${discardLabel}: ${name}`}
            onPress={handleDiscard}
            haptic="selection"
            className="min-h-recommended justify-center px-md"
          >
            <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
              {discardLabel}
            </Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
});
