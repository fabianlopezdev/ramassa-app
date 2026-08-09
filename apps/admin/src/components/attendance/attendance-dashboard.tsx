import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttendanceDashboardData } from '@ramassa/shared/attendance';
import { resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';
import { AttendanceTotalsCards } from './attendance-report';

export function AttendanceDashboard({ data }: { readonly data: AttendanceDashboardData }) {
  const { t, i18n } = useTranslation('attendance');
  const language = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    [language],
  );

  if (data.overall.marked_count === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">{t('dashboardTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('dashboardEmpty')}</p>
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-6" aria-labelledby="attendance-dashboard-title">
      <div>
        <h2 id="attendance-dashboard-title" className="text-lg font-semibold">
          {t('dashboardTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('reportExcusedHelp')}</p>
      </div>
      <AttendanceTotalsCards
        present={data.overall.present_count}
        absent={data.overall.absent_count}
        excused={data.overall.excused_count}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h3 className="font-semibold">{t('dashboardTrend')}</h3>
          <div
            className="mt-4 flex min-h-56 items-end gap-3 overflow-x-auto"
            role="img"
            aria-label={t('dashboardTrendDescription')}
          >
            {data.periods.map((period) => (
              <div
                key={period.period_start}
                className="flex min-w-16 flex-1 flex-col items-center gap-2"
              >
                <span className="text-xs font-medium tabular-nums">
                  {period.attendance_rate.toFixed(0)}%
                </span>
                <div className="flex h-36 w-full items-end rounded-md bg-muted" aria-hidden="true">
                  <div
                    className="w-full rounded-md bg-primary"
                    style={{ height: `${Math.max(period.attendance_rate, 2)}%` }}
                  />
                </div>
                <span className="text-center text-xs text-muted-foreground">
                  {monthFormatter.format(new Date(`${period.period_start}T00:00:00Z`))}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border p-4">
          <h3 className="font-semibold">{t('dashboardCategories')}</h3>
          <ul className="mt-4 divide-y">
            {data.categories.map((category) => (
              <li
                key={category.category_id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <p className="font-medium">
                    {resolveLocalizedText(category.category_name, language)?.text ??
                      category.category_name.ca}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('dashboardCategoryEvents', { count: category.event_count })}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">
                  {category.attendance_rate.toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
