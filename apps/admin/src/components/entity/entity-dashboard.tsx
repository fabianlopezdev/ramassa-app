import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityDashboard as EntityDashboardData } from '@ramassa/shared/entity-management';
import type { SupportedLanguage } from '@ramassa/shared/i18n/languages';
import { resolveLocalizedText } from '@ramassa/shared/i18n/localized-content';

interface EntityDashboardProps {
  readonly dashboard: EntityDashboardData;
  readonly sections?: readonly ('impact' | 'tracking' | 'events')[];
}

function Metric({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm" data-testid={testId}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function EntityDashboard({
  dashboard,
  sections = ['impact', 'tracking', 'events'],
}: EntityDashboardProps) {
  const { t, i18n } = useTranslation('entity-management');
  const language = (i18n?.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'Europe/Madrid' }),
    [language],
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    [language],
  );
  const hasSection = (section: 'impact' | 'tracking' | 'events') => sections.includes(section);

  return (
    <section className="space-y-8 p-4 sm:p-6">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('dashboardTitle')}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{t('dashboardIntro')}</p>
      </header>

      {hasSection('impact') ? (
        <section aria-labelledby="entity-impact-heading" className="space-y-4">
          <h2 id="entity-impact-heading" className="text-lg font-semibold text-foreground">
            {t('monthlyTitle')}
          </h2>
          {dashboard.impact.suppressed ? (
            <div
              className="rounded-xl border border-primary/25 bg-primary/5 p-4"
              data-testid="entity-impact-suppressed"
            >
              <p className="font-medium text-foreground">{t('privacyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('privacyBody')}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label={t('referred')}
                  value={String(dashboard.impact.referredCount ?? 0)}
                  testId="entity-impact-referred"
                />
                <Metric
                  label={t('active')}
                  value={String(dashboard.impact.activeCount ?? 0)}
                  testId="entity-impact-active"
                />
                <Metric
                  label={t('present')}
                  value={String(dashboard.impact.attendancePresentCount ?? 0)}
                  testId="entity-impact-present"
                />
                <Metric
                  label={t('attendanceRate')}
                  value={`${dashboard.impact.attendanceRate ?? 0}%`}
                  testId="entity-impact-rate"
                />
              </div>

              {dashboard.trend.length > 0 ? (
                <Table data-testid="entity-trend-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('month')}</TableHead>
                      <TableHead>{t('participants')}</TableHead>
                      <TableHead>{t('present')}</TableHead>
                      <TableHead>{t('marked')}</TableHead>
                      <TableHead>{t('attendanceRate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.trend.map((point) => (
                      <TableRow key={point.monthStart}>
                        <TableCell>
                          {monthFormatter.format(new Date(`${point.monthStart}T00:00:00Z`))}
                        </TableCell>
                        <TableCell>{point.participantCount}</TableCell>
                        <TableCell>{point.attendancePresentCount}</TableCell>
                        <TableCell>{point.attendanceMarkedCount}</TableCell>
                        <TableCell>{point.attendanceRate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {hasSection('tracking') ? (
        <section aria-labelledby="entity-tracking-heading" className="space-y-4">
          <h2 id="entity-tracking-heading" className="text-lg font-semibold text-foreground">
            {t('trackingTitle')}
          </h2>
          {dashboard.tracking.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              {t('trackingEmpty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('participants')}</TableHead>
                  <TableHead>{t('statusHeading')}</TableHead>
                  <TableHead>{t('present')}</TableHead>
                  <TableHead>{t('absent')}</TableHead>
                  <TableHead>{t('excused')}</TableHead>
                  <TableHead>{t('marked')}</TableHead>
                  <TableHead>{t('attendanceRate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.tracking.map((participant) => (
                  <TableRow key={participant.referralId} data-testid="entity-tracking-row">
                    <TableCell className="font-medium">
                      {participant.referredFirstName} {participant.referredLastName}
                    </TableCell>
                    <TableCell>{t(`status.${participant.status}`)}</TableCell>
                    <TableCell>{participant.attendancePresentCount}</TableCell>
                    <TableCell>{participant.attendanceAbsentCount}</TableCell>
                    <TableCell>{participant.attendanceExcusedCount}</TableCell>
                    <TableCell>{participant.attendanceMarkedCount}</TableCell>
                    <TableCell>{participant.attendanceRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ) : null}

      {hasSection('events') ? (
        <section aria-labelledby="entity-events-heading" className="space-y-4">
          <header className="space-y-1">
            <h2 id="entity-events-heading" className="text-lg font-semibold text-foreground">
              {t('eventsTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('eventsIntro')}</p>
          </header>
          {dashboard.upcomingEvents.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              {t('eventsEmpty')}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {dashboard.upcomingEvents.map((event) => {
                const title = resolveLocalizedText(event.title, language)?.text ?? '';
                const description = resolveLocalizedText(event.description, language)?.text ?? '';
                return (
                  <article
                    key={event.id}
                    className="rounded-xl border bg-card p-4 shadow-sm"
                    data-testid="entity-event-card"
                  >
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dateFormatter.format(new Date(event.startsAt))} · {event.location}
                    </p>
                    {event.isRecurring ? (
                      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-primary">
                        {t('recurring')}
                      </p>
                    ) : null}
                    {description.length > 0 ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
