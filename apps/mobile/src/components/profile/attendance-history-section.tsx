/**
 * Her attendance on La meva assistència (RAPP-896): her two totals in a navy
 * band, the note on excused absences with an info mark, then her recent
 * activities as an open list, each with its status mark from the staff side.
 */
import {
  attendanceStatusColors,
  attendanceStatusIcons,
  attendanceStatusKey,
} from '@/components/attendance/attendance-row';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { Icon } from '@/components/icons/icon';
import { DIVIDER_COLOR_CLASS_NAME } from '@/components/layout/divider';
import { RAISED_SHAPE_CLASS_NAME } from '@/components/layout/raised-surface';
import { SectionTitle } from '@/components/layout/screen-section';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { useOwnAttendanceHistory } from '@/lib/attendance-history';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { AttendanceStatus } from '@ramassa/shared/attendance';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

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

  if (isLoading) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
        accessibilityLabel={t('loading')}
        className="gap-lg"
      >
        <SkeletonPulse className="h-3xl w-full rounded-lg" />
        <SkeletonPulse className="h-3xl w-full rounded-md" />
      </View>
    );
  }
  if (isError) {
    return (
      <View className="gap-sm">
        <Text className={`text-start text-form text-error ${fontClass}`}>{t('loadFailed')}</Text>
        <RaisedActionButton label={t('retry')} onPress={handleRetry} isDisabled={isFetching} />
      </View>
    );
  }
  if (data?.stats === null || data?.stats === undefined) {
    return (
      <View className="gap-md">
        <SectionTitle title={t('participantHistoryTitle')} />
        <Text className={`text-start text-form text-neutral-600 ${fontClass}`}>
          {t('participantHistoryEmpty')}
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-lg">
      <View className="gap-md">
        <View
          style={continuousCorners}
          className={`${RAISED_SHAPE_CLASS_NAME} flex-row bg-primary px-lg py-md`}
        >
          <TotalHalf
            testID="attendance-history-attended"
            label={t('historyAttended')}
            count={data.stats.present_count}
            fontClass={fontClass}
          />
          <View accessible={false} className="mx-lg w-px bg-primary-light" />
          <TotalHalf
            testID="attendance-history-missed"
            label={t('historyMissed')}
            count={data.stats.absent_count}
            fontClass={fontClass}
          />
        </View>
        <View className="flex-row items-start gap-sm">
          <Icon
            name="info-circle"
            weight="linear"
            size={tokens.fontSize['2xl']}
            color={tokens.colors.neutral[600]}
          />
          <Text className={`flex-1 text-start text-md text-neutral-600 ${fontClass}`}>
            {t('reportExcusedHelp')}
          </Text>
        </View>
      </View>
      <View className="gap-sm">
        <SectionTitle title={t('participantHistoryTitle')} />
        <View accessibilityRole="list" accessibilityLabel={t('participantHistoryTitle')}>
          {data.rows.map((row) => (
            <AttendanceHistoryRow
              key={row.attendance_id}
              title={resolveLocalizedText(row.event_title, language)?.text ?? row.event_title.ca}
              date={dateFormatter.format(new Date(row.starts_at))}
              status={row.status}
              statusLabel={t(attendanceStatusKey(row.status))}
              fontClass={fontClass}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const AttendanceHistoryRow = memo(function AttendanceHistoryRow({
  title,
  date,
  status,
  statusLabel,
  fontClass,
}: {
  readonly title: string;
  readonly date: string;
  readonly status: AttendanceStatus;
  readonly statusLabel: string;
  readonly fontClass: string;
}) {
  const mark = attendanceStatusIcons[status];
  return (
    <View
      role="listitem"
      accessible
      accessibilityLabel={`${title}, ${date}: ${statusLabel}`}
      className={`flex-row items-center justify-between gap-md border-b py-md ${DIVIDER_COLOR_CLASS_NAME}`}
    >
      <View className="min-w-0 flex-1 gap-xs">
        <Text
          numberOfLines={2}
          className={`text-start text-form font-bold text-neutral-900 ${fontClass}`}
        >
          {title}
        </Text>
        <Text className={`text-start text-md tabular-nums text-neutral-600 ${fontClass}`}>
          {date}
        </Text>
      </View>
      <View className="flex-row items-center gap-xs">
        <Icon
          name={mark.name}
          weight={mark.weight}
          size={tokens.fontSize['2xl']}
          color={attendanceStatusColors[status]}
        />
        <Text className={`text-start text-form font-semibold text-neutral-900 ${fontClass}`}>
          {statusLabel}
        </Text>
      </View>
    </View>
  );
});

const TotalHalf = memo(function TotalHalf({
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
    <View testID={testID} accessible accessibilityLabel={`${label}: ${count}`} className="flex-1">
      <Text className={`text-start text-4xl font-extrabold tabular-nums text-white ${fontClass}`}>
        {count}
      </Text>
      <Text className={`text-start text-form text-white ${fontClass}`}>{label}</Text>
    </View>
  );
});
