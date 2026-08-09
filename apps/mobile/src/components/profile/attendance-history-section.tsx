import { ErrorCodeLine } from '@/components/error-code-line';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { ProfileSection } from '@/components/profile/profile-section';
import { useOwnAttendanceHistory } from '@/lib/attendance-history';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';

export function AttendanceHistorySection() {
  const { t, i18n } = useTranslation('attendance');
  const fontClass = useLanguageFontClass();
  const query = useOwnAttendanceHistory();
  const language = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }),
    [language],
  );

  return (
    <ProfileSection title={t('participantHistoryTitle')}>
      {query.isLoading ? (
        <View accessible accessibilityState={{ busy: true }} accessibilityLabel={t('loading')}>
          <SkeletonPulse className="h-3xl w-full rounded-md" />
        </View>
      ) : query.isError ? (
        <View className="gap-sm">
          <Text className={`text-start text-sm text-error ${fontClass}`}>{t('loadFailed')}</Text>
          <ErrorCodeLine code="DB-1" />
          <Pressable
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-md border border-neutral-300 px-md"
            onPress={() => void query.refetch()}
          >
            <Text className={`text-md font-semibold text-neutral-900 ${fontClass}`}>
              {t('retry')}
            </Text>
          </Pressable>
        </View>
      ) : query.data?.stats === null || query.data?.stats === undefined ? (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('participantHistoryEmpty')}
        </Text>
      ) : (
        <View className="gap-md">
          <View className="flex-row gap-sm">
            <CountCard
              testID="attendance-history-attended"
              label={t('historyAttended')}
              count={query.data.stats.present_count}
            />
            <CountCard
              testID="attendance-history-missed"
              label={t('historyMissed')}
              count={query.data.stats.absent_count}
            />
          </View>
          <Text className={`text-start text-xs text-neutral-600 ${fontClass}`}>
            {t('reportExcusedHelp')}
          </Text>
          <View className="gap-sm">
            {query.data.rows.map((row) => (
              <View
                key={row.attendance_id}
                className="flex-row items-center justify-between gap-md border-t border-neutral-200 pt-sm"
              >
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={2}
                    className={`text-start text-sm font-medium text-neutral-900 ${fontClass}`}
                  >
                    {resolveLocalizedText(row.event_title, language)?.text ?? row.event_title.ca}
                  </Text>
                  <Text className={`text-start text-xs text-neutral-600 ${fontClass}`}>
                    {dateFormatter.format(new Date(row.starts_at))}
                  </Text>
                </View>
                <Text className={`text-sm font-semibold text-neutral-900 ${fontClass}`}>
                  {t(
                    row.status === 'present'
                      ? 'statusPresent'
                      : row.status === 'absent'
                        ? 'statusAbsent'
                        : 'statusExcused',
                  )}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ProfileSection>
  );
}

function CountCard({
  label,
  count,
  testID,
}: {
  readonly label: string;
  readonly count: number;
  readonly testID: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View testID={testID} className="min-w-0 flex-1 rounded-md bg-neutral-100 p-md">
      <Text className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}>{count}</Text>
      <Text className={`text-start text-xs text-neutral-600 ${fontClass}`}>{label}</Text>
    </View>
  );
}
