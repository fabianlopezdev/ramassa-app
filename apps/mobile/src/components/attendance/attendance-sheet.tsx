import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import {
  AttendanceRow,
  attendanceStatusKey,
  attendanceSyncKey,
} from '@/components/attendance/attendance-row';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useAttendanceMarker, useAttendanceSheet } from '@/lib/attendance';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { nextAttendanceStatus, type AttendanceParticipant } from '@ramassa/shared/attendance';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_PARTICIPANTS: readonly AttendanceParticipant[] = [];
const listContentStyle = { paddingBottom: tokens.spacing['3xl'] } as const;
const keyExtractor = (participant: AttendanceParticipant) => participant.id;

/**
 * A session's attendance sheet (RAPP-245 made it a pane): a screen of its own
 * on a phone, and the right half of Today on a tablet, where it has no way
 * back because the list stays beside it.
 */
export function AttendanceSheet({
  occurrenceId: id,
  onBack,
}: {
  readonly occurrenceId: string;
  readonly onBack?: () => void;
}) {
  const { t } = useTranslation('attendance');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const { data, isPending, isError, error, refetch } = useAttendanceSheet(id);
  const { mark, pendingMarks, syncStateFor, rejectionFor, retryMark, discardMark } =
    useAttendanceMarker(id);
  const participants = data?.participants ?? EMPTY_PARTICIPANTS;
  const title =
    data === undefined
      ? ''
      : (resolveLocalizedText(data.event.title, language)?.text ?? data.event.title.ca);
  const marked = useMemo(() => {
    let count = 0;
    for (const participant of participants) {
      if (participant.mark !== null) count += 1;
    }
    return count;
  }, [participants]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AttendanceParticipant>) => {
      const status = item.mark?.status ?? null;
      const syncState = syncStateFor(item.id);
      const name = `${item.first_name} ${item.last_name}`;
      const statusLabel = t(attendanceStatusKey(status));
      const nextLabel = t(attendanceStatusKey(nextAttendanceStatus(status)));
      return (
        <AttendanceRow
          playerId={item.id}
          name={name}
          signedUp={item.signed_up}
          status={status}
          markedAt={item.mark?.marked_at ?? null}
          syncState={syncState}
          accessibilityLabel={t('tapAction', { name, current: statusLabel, next: nextLabel })}
          statusLabel={statusLabel}
          signedUpLabel={t('signedUp')}
          syncLabel={t(attendanceSyncKey(syncState, rejectionFor(item.id)))}
          languageFontClass={languageFontClass}
          retryLabel={t('syncRetryAction')}
          discardLabel={t('syncDiscardAction')}
          onRetry={retryMark}
          onDiscard={discardMark}
          onMark={mark}
        />
      );
    },
    [discardMark, languageFontClass, mark, rejectionFor, retryMark, syncStateFor, t],
  );
  const handleRetry = useCallback(() => void refetch(), [refetch]);

  if (isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />;
  if (isError) {
    return (
      <AnnouncementFeedError
        message={t('loadFailed')}
        retryLabel={t('retry')}
        code={toAppError(error).code}
        languageFontClass={languageFontClass}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
      <View className="gap-md border-b border-neutral-200 bg-neutral-50 px-lg pb-md pt-lg">
        {onBack === undefined ? null : (
          <PressableScale
            accessibilityLabel={t('back')}
            onPress={onBack}
            className="min-h-min self-start justify-center"
          >
            <Text
              className={`text-start text-sm font-semibold text-primary-dark ${languageFontClass}`}
            >
              {t('back')}
            </Text>
          </PressableScale>
        )}
        <View className="gap-xs">
          <Text
            accessibilityRole="header"
            className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {title}
          </Text>
          <Text
            className={`text-start text-md font-semibold tabular-nums text-neutral-700 ${languageFontClass}`}
          >
            {t('summary', { marked, expected: participants.length })}
          </Text>
        </View>
        {isOffline ? (
          <OfflineBanner label={t('offlineBanner')} languageFontClass={languageFontClass} />
        ) : null}
      </View>
      {participants.length === 0 ? (
        <AnnouncementEmptyState
          title={t('noParticipantsTitle')}
          body={t('noParticipantsBody')}
          languageFontClass={languageFontClass}
        />
      ) : (
        <FlashList
          accessibilityRole="list"
          accessibilityLabel={t('participantListLabel')}
          data={participants}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={pendingMarks}
          contentContainerStyle={listContentStyle}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </SafeAreaView>
  );
}
