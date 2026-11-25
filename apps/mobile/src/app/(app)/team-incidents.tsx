/**
 * Incidents on the phone (RAPP-973), for `incidents.manage` holders, as on the
 * dashboard: every report, open first, with who sent it or "Anònim" when she
 * chose so (the database sends no id and no name for it), what happened, when
 * and where, and her answers to the questions staff added. A report is closed,
 * or opened again.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { FormAnswerList } from '@/components/forms/form-answer-list';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { Badge } from '@/components/layout/badge';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { screenContentClassName } from '@/components/layout/screen-spacing';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useIncidentStatus, useStaffIncidentReports } from '@/lib/team-incidents';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import type { StaffIncidentReport } from '@ramassa/shared/incidents';

function ReportCard({
  report,
  language,
}: {
  readonly report: StaffIncidentReport;
  readonly language: string;
}) {
  const { t } = useTranslation('incidents');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const status = useIncidentStatus();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const isOpen = report.status === 'open';
  const sentAt = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MADRID_TIME_ZONE,
  }).format(new Date(report.createdAt));
  // The day it happened is a calendar day: read at noon in Madrid so no zone moves it.
  const happenedOn = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeZone: MADRID_TIME_ZONE,
  }).format(new Date(`${report.happenedOn}T12:00:00Z`));
  const sender =
    report.sender.kind === 'anonymous'
      ? t('anonymous')
      : t('adminSentBy', {
          name: `${report.sender.firstName} ${report.sender.lastName}`.trim(),
        });

  return (
    <View
      testID={`incident-report-${report.id}`}
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <View className="flex-row flex-wrap items-start justify-between gap-sm">
        <View className="flex-1 gap-xs">
          <Text
            testID={`incident-sender-${report.id}`}
            className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
          >
            {sender}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('sentOn', { date: sentAt })}
          </Text>
        </View>
        <Badge
          testID={`incident-status-${report.id}`}
          label={t(isOpen ? 'statusOpen' : 'statusClosed')}
          languageFontClass={fontClass}
        />
      </View>
      <View style={continuousCorners} className="rounded-md bg-neutral-50 p-md">
        <FormAnswerList
          testID={`incident-answers-${report.id}`}
          answers={report.answers}
          leading={[
            { label: t('whatLabel'), value: report.what },
            { label: t('whenLabel'), value: happenedOn },
            { label: t('whereLabel'), value: report.where },
          ]}
        />
      </View>
      <RaisedActionButton
        testID={`incident-${isOpen ? 'close' : 'reopen'}-${report.id}`}
        label={t(isOpen ? 'adminClose' : 'adminReopen')}
        isDisabled={status.isPending}
        onPress={() =>
          status.mutate(
            { reportId: report.id, status: isOpen ? 'closed' : 'open' },
            {
              onSuccess: () => {
                playHaptic('success');
                setErrorCode(null);
              },
              onError: (error: unknown) => {
                playHaptic('error');
                setErrorCode(toAppError(error).code);
              },
            },
          )
        }
      />
      {errorCode === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${fontClass}`}
        >
          {`${t('adminSaveFailed')} ${tErrors(errorCode, { defaultValue: '' })}`.trim()}
        </Text>
      )}
    </View>
  );
}

export default function TeamIncidentsScreen() {
  const { t, i18n } = useTranslation('incidents');
  const fontClass = useLanguageFontClass();
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const reports = useStaffIncidentReports();
  const rows = useMemo(() => reports.data ?? [], [reports.data]);

  return (
    <SafeAreaView
      testID="team-incidents"
      className="flex-1 bg-neutral-50"
      edges={['left', 'right']}
    >
      <NativeScreenHeader title={t('adminTitle')} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className={screenContentClassName}>
          {reports.isSuccess ? (
            <Text
              testID="team-incidents-total"
              className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}
            >
              {t('adminCount', { count: rows.length })}
            </Text>
          ) : null}
          {reports.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('adminTitle')} />
          ) : reports.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>{t('loadFailed')}</Text>
          ) : rows.length === 0 ? (
            <Text className={`py-xl text-center text-md text-neutral-600 ${fontClass}`}>
              {t('adminEmpty')}
            </Text>
          ) : (
            <View className="gap-md">
              {rows.map((report) => (
                <ReportCard key={report.id} report={report} language={language} />
              ))}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
