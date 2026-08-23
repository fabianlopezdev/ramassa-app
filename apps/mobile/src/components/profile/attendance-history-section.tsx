import { ErrorCodeLine } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { ProfileSection } from '@/components/profile/profile-section';
import { useOwnAttendanceHistory } from '@/lib/attendance-history';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

export function AttendanceHistorySection() {
  const { t, i18n } = useTranslation('attendance');
  const fontClass = useLanguageFontClass();
  const { data, isError, isFetching, isLoading, refetch } = useOwnAttendanceHistory();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }),
    [language],
  );
  const handleRetry = useCallback(() => void refetch(), [refetch]);

  return (
    <ProfileSection title={t('participantHistoryTitle')}>
      {isLoading ? (
        <View accessible accessibilityState={{ busy: true }} accessibilityLabel={t('loading')}>
          <SkeletonPulse className="h-3xl w-full rounded-md" />
        </View>
      ) : isError ? (
        <View className="gap-sm">
          <Text className={`text-start text-sm text-error ${fontClass}`}>{t('loadFailed')}</Text>
          <ErrorCodeLine code="DB-1" />
          <PressableScale
            accessibilityLabel={t('retry')}
            isBusy={isFetching}
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-md"
            onPress={handleRetry}
          >
            <Text className={`text-md font-semibold text-neutral-900 ${fontClass}`}>
              {t('retry')}
            </Text>
          </PressableScale>
        </View>
      ) : data?.stats === null || data?.stats === undefined ? (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('participantHistoryEmpty')}
        </Text>
      ) : (
        <View className="gap-md">
          <View className="flex-row gap-sm">
            <CountCard
              testID="attendance-history-attended"
              label={t('historyAttended')}
              count={data.stats.present_count}
              fontClass={fontClass}
            />
            <CountCard
              testID="attendance-history-missed"
              label={t('historyMissed')}
              count={data.stats.absent_count}
              fontClass={fontClass}
            />
          </View>
          <Text className={`text-start text-xs text-neutral-600 ${fontClass}`}>
            {t('reportExcusedHelp')}
          </Text>
          <View
            accessibilityRole="list"
            accessibilityLabel={t('participantHistoryTitle')}
            className="gap-sm"
          >
            {data.rows.map((row) => {
              const title =
                resolveLocalizedText(row.event_title, language)?.text ?? row.event_title.ca;
              const statusLabel = t(
                row.status === 'present'
                  ? 'statusPresent'
                  : row.status === 'absent'
                    ? 'statusAbsent'
                    : 'statusExcused',
              );
              return (
                <AttendanceHistoryRow
                  key={row.attendance_id}
                  title={title}
                  date={dateFormatter.format(new Date(row.starts_at))}
                  statusLabel={statusLabel}
                  fontClass={fontClass}
                />
              );
            })}
          </View>
        </View>
      )}
    </ProfileSection>
  );
}

const AttendanceHistoryRow = memo(function AttendanceHistoryRow({
  title,
  date,
  statusLabel,
  fontClass,
}: {
  readonly title: string;
  readonly date: string;
  readonly statusLabel: string;
  readonly fontClass: string;
}) {
  return (
    <View
      role="listitem"
      className="flex-row items-center justify-between gap-md border-t border-neutral-200 pt-sm"
    >
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={2}
          className={`text-start text-sm font-medium text-neutral-900 ${fontClass}`}
        >
          {title}
        </Text>
        <Text className={`text-start text-xs tabular-nums text-neutral-600 ${fontClass}`}>
          {date}
        </Text>
      </View>
      <Text className={`text-start text-sm font-semibold text-neutral-900 ${fontClass}`}>
        {statusLabel}
      </Text>
    </View>
  );
});

const CountCard = memo(function CountCard({
  label,
  count,
  testID,
  fontClass,
}: {
  readonly label: string;
  readonly count: number;
  readonly testID: string;
  readonly fontClass: string;
}) {
  return (
    <View
      testID={testID}
      style={continuousCorners}
      className="min-w-0 flex-1 rounded-md bg-neutral-100 p-md"
    >
      <Text className={`text-start text-2xl font-bold tabular-nums text-neutral-900 ${fontClass}`}>
        {count}
      </Text>
      <Text className={`text-start text-xs text-neutral-600 ${fontClass}`}>{label}</Text>
    </View>
  );
});
