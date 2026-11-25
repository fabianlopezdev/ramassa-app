/**
 * Reportar un incident (RAPP-973), opened from Contacte: the reports she sent,
 * and the bottom button that opens a new one (`/incident/new`), as Mentoria
 * lists her requests. A report she just sent comes back here with a notice
 * (`sent`). Each report shows its state, the day it happened, when she sent it
 * and whether she sent it anonymously; what she wrote stays with the team.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { FailureNotice } from '@/components/error-code-line';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { FormWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { OpenableCard } from '@/components/layout/openable-card';
import { ActionScreen } from '@/components/layout/screen-action';
import { ScreenSection } from '@/components/layout/screen-section';
import { SentNotice } from '@/components/layout/sent-notice';
import { usePlayerIncidentReports } from '@/lib/player-incidents';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import type { OwnIncidentReport } from '@ramassa/shared/incidents';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_REPORTS: readonly OwnIncidentReport[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  content: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg },
});

export default function IncidentsScreen() {
  const { t, i18n } = useTranslation('incidents');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  const reportsQuery = usePlayerIncidentReports();
  const refetchReports = reportsQuery.refetch;
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const sentFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [language],
  );
  // The day it happened is a calendar day: read at noon in Madrid so no zone moves it.
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: MADRID_TIME_ZONE }),
    [language],
  );
  const insets = useSafeAreaInsets();
  const contentContainerStyle = useMemo(
    () => [
      styles.content,
      process.env.EXPO_OS === 'android'
        ? { paddingBottom: insets.bottom + tokens.spacing.lg }
        : undefined,
    ],
    [insets.bottom],
  );
  const openNew = useCallback(() => push('/incident/new' as Href), [push]);
  const retry = useCallback(() => void refetchReports(), [refetchReports]);
  const reports = reportsQuery.data ?? EMPTY_REPORTS;
  const hasReports = reports.length > 0;
  const reportsFailed = reportsQuery.isError && reportsQuery.data === undefined;

  return (
    <ActionScreen
      className="bg-neutral-50"
      action={<AuthSubmitButton testID="incident-new" label={t('title')} onPress={openNew} />}
    >
      <NativeScreenHeader title={t('title')} />
      <ScrollView
        testID="incident-screen"
        style={styles.screen}
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
      >
        <FormWidth className="gap-lg">
          {sent === '1' ? (
            <SentNotice testID="incident-sent" title={t('successTitle')} body={t('successBody')} />
          ) : null}
          {hasReports || reportsFailed ? (
            <ScreenSection title={t('listTitle')} isLast>
              {reportsFailed ? (
                <View className="gap-sm">
                  <FailureNotice
                    code={toAppError(reportsQuery.error).code}
                    message={t('loadFailed')}
                  />
                  <RaisedActionButton label={t('retry')} onPress={retry} />
                </View>
              ) : (
                <View className="gap-md">
                  {reports.map((report) => {
                    const status = t(report.status === 'open' ? 'statusOpen' : 'statusClosed');
                    const happened = t('happenedOn', {
                      date: dayFormatter.format(new Date(`${report.happenedOn}T12:00:00Z`)),
                    });
                    const sentOn = t('sentOn', {
                      date: sentFormatter.format(new Date(report.createdAt)),
                    });
                    const anonymous = report.isAnonymous ? t('anonymous') : null;
                    return (
                      <OpenableCard
                        key={report.id}
                        testID={`incident-report-${report.id}`}
                        accessibilityLabel={[status, happened, sentOn, anonymous]
                          .filter((part): part is string => part !== null)
                          .join('. ')}
                        className="rounded-lg border border-neutral-200 bg-white p-lg"
                      >
                        <Text
                          className={`text-start text-md font-bold text-primary ${languageFontClass}`}
                        >
                          {status}
                        </Text>
                        <Text
                          className={`text-start text-md font-semibold tabular-nums text-neutral-900 ${languageFontClass}`}
                        >
                          {happened}
                        </Text>
                        <Text
                          className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
                        >
                          {sentOn}
                        </Text>
                        {anonymous === null ? null : (
                          <Text
                            className={`text-start text-sm text-neutral-600 ${languageFontClass}`}
                          >
                            {anonymous}
                          </Text>
                        )}
                      </OpenableCard>
                    );
                  })}
                </View>
              )}
            </ScreenSection>
          ) : null}
          {reportsQuery.isSuccess && !hasReports ? (
            <Text
              testID="incident-empty"
              className={`text-start text-md text-neutral-600 ${languageFontClass}`}
            >
              {t('empty')}
            </Text>
          ) : null}
        </FormWidth>
      </ScrollView>
    </ActionScreen>
  );
}
