/**
 * Incidents (RAPP-973): the reports players send from Contacte, open first and
 * newest first. Each shows who sent it, or "Anònim" when she chose so (the
 * database sends no id and no name for it), then what happened, when and
 * where, and her answers to the questions staff added, each under its question
 * in the list the mentoring queue shows them with. The team closes a report, or opens it
 * again.
 */

import { FormAnswerList } from '@/components/custom-forms/form-answer-list';
import { Page } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import {
  setIncidentReportStatus,
  type IncidentStatus,
  type StaffIncidentReport,
} from '@ramassa/shared/incidents';

export function StaffIncidentQueue({
  reports,
}: {
  readonly reports: readonly StaffIncidentReport[];
}) {
  const { t, i18n } = useTranslation('incidents');
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const language = i18n.resolvedLanguage ?? 'ca';
  const sentFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }),
    [language],
  );
  // The day it happened is a calendar day: read at noon in Madrid so no zone moves it.
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: MADRID_TIME_ZONE }),
    [language],
  );

  const setStatus = async (report: StaffIncidentReport, status: IncidentStatus) => {
    setSavingId(report.id);
    setErrorCode(null);
    try {
      await setIncidentReportStatus(supabase, report.id, status);
      await router.invalidate();
    } catch (error) {
      setErrorCode(toAppError(error).code);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Page className="gap-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('adminTitle')}</h1>
        <p className="text-sm font-medium">{t('adminCount', { count: reports.length })}</p>
      </header>

      {errorCode === null ? null : (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {t('adminSaveFailed')} ({errorCode})
        </p>
      )}

      {reports.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          {t('adminEmpty')}
        </p>
      ) : (
        <ol data-testid="incident-queue" className="grid gap-4 lg:grid-cols-2">
          {reports.map((report) => {
            const isSaving = savingId === report.id;
            const sender =
              report.sender.kind === 'anonymous'
                ? t('anonymous')
                : t('adminSentBy', {
                    name: `${report.sender.firstName} ${report.sender.lastName}`.trim(),
                  });
            return (
              <li
                key={report.id}
                data-testid={`incident-row-${report.id}`}
                className="space-y-5 rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2
                      data-testid={`incident-sender-${report.id}`}
                      className="text-lg font-semibold"
                    >
                      {sender}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t('sentOn', { date: sentFormatter.format(new Date(report.createdAt)) })}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                    {t(report.status === 'open' ? 'statusOpen' : 'statusClosed')}
                  </span>
                </div>

                <div className="space-y-2 rounded-lg bg-muted/50 p-4">
                  {/* What, when and where, then her answers to the questions staff added. */}
                  <FormAnswerList
                    testId={`incident-answers-${report.id}`}
                    answers={report.answers}
                    leading={[
                      { label: t('whatLabel'), value: report.what },
                      {
                        label: t('whenLabel'),
                        value: dayFormatter.format(new Date(`${report.happenedOn}T12:00:00Z`)),
                      },
                      { label: t('whereLabel'), value: report.where },
                    ]}
                  />
                </div>

                <Button
                  data-testid={`incident-${report.status === 'open' ? 'close' : 'reopen'}-${report.id}`}
                  variant="outline"
                  disabled={isSaving}
                  onClick={() =>
                    void setStatus(report, report.status === 'open' ? 'closed' : 'open')
                  }
                >
                  {t(report.status === 'open' ? 'adminClose' : 'adminReopen')}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </Page>
  );
}
