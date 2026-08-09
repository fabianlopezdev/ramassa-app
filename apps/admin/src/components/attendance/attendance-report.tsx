import { DetailSection } from '@/components/detail/detail-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  calculateAttendanceRate,
  type AttendanceParticipantStats,
  type AttendanceReportRow,
} from '@ramassa/shared/attendance';
import { resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';

function StatusBadge({ status }: { readonly status: AttendanceReportRow['status'] }) {
  const { t } = useTranslation('attendance');
  const key =
    status === 'present' ? 'statusPresent' : status === 'absent' ? 'statusAbsent' : 'statusExcused';
  return <Badge variant={status === 'present' ? 'default' : 'outline'}>{t(key)}</Badge>;
}

export function AttendanceTotalsCards({
  present,
  absent,
  excused,
}: {
  readonly present: number;
  readonly absent: number;
  readonly excused: number;
}) {
  const { t } = useTranslation('attendance');
  const rate = calculateAttendanceRate({ present, absent, excused });
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label={t('reportRate')} value={`${rate.toFixed(2)}%`} testId="attendance-rate" />
      <StatCard label={t('statusPresent')} value={present} />
      <StatCard label={t('statusAbsent')} value={absent} />
      <StatCard label={t('statusExcused')} value={excused} />
    </dl>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly testId?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function AttendanceOccurrenceReport({
  rows,
}: {
  readonly rows: readonly AttendanceReportRow[];
}) {
  const { t, i18n } = useTranslation('attendance');
  const language = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Europe/Madrid',
      }),
    [language],
  );
  const first = rows[0];
  const counts = rows.reduce(
    (result, row) => ({ ...result, [row.status]: result[row.status] + 1 }),
    { present: 0, absent: 0, excused: 0 },
  );

  return (
    <section className="flex flex-col gap-6 p-4 md:p-6">
      <Button asChild variant="ghost" className="w-fit">
        <Link to="/attendance">{t('reportBack')}</Link>
      </Button>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {first === undefined
            ? t('reportTitle')
            : (resolveLocalizedText(first.event_title, language)?.text ?? first.event_title.ca)}
        </h1>
        {first === undefined ? null : (
          <p className="text-sm text-muted-foreground">
            {dateFormatter.format(new Date(first.starts_at))} · {first.event_location}
          </p>
        )}
      </header>
      {rows.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border p-6 text-center">
          <h2 className="text-lg font-semibold">{t('reportEmptyTitle')}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t('reportEmptyBody')}</p>
        </div>
      ) : (
        <>
          <AttendanceTotalsCards {...counts} />
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-start">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-medium">
                    {t('reportParticipant')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">
                    {t('columnStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.attendance_id} className="border-b last:border-0">
                    <td className="px-4 py-3">{`${row.first_name} ${row.last_name}`}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function ParticipantAttendanceReport({
  stats,
  history,
}: {
  readonly stats: AttendanceParticipantStats | null;
  readonly history: readonly AttendanceReportRow[];
}) {
  const { t, i18n } = useTranslation('attendance');
  const language = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'Europe/Madrid' }),
    [language],
  );
  return (
    <DetailSection title={t('participantHistoryTitle')} description={t('reportExcusedHelp')}>
      {stats === null ? (
        <p className="text-sm text-muted-foreground">{t('participantHistoryEmpty')}</p>
      ) : (
        <>
          <AttendanceTotalsCards
            present={stats.present_count}
            absent={stats.absent_count}
            excused={stats.excused_count}
          />
          <ul className="divide-y rounded-lg border">
            {history.map((row) => (
              <li
                key={row.attendance_id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium">
                    {resolveLocalizedText(row.event_title, language)?.text ?? row.event_title.ca}
                  </p>
                  <time className="text-sm text-muted-foreground" dateTime={row.starts_at}>
                    {dateFormatter.format(new Date(row.starts_at))}
                  </time>
                </div>
                <StatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </DetailSection>
  );
}
