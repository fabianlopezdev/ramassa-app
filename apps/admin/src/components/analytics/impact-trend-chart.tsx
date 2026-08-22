import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImpactReport } from '@ramassa/shared/analytics';

type TrendPoint = ImpactReport['participantTrend'][number];

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_LEFT = 52;
const CHART_TOP = 18;
const CHART_RIGHT = 18;
const CHART_BOTTOM = 48;
const MAX_TREND_POINTS = 12;

export function ImpactTrendChart({ points }: { readonly points: readonly TrendPoint[] }) {
  const { t, i18n } = useTranslation('admin');
  const visiblePoints = points.slice(-MAX_TREND_POINTS);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n?.resolvedLanguage ?? 'ca', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }),
    [i18n?.resolvedLanguage],
  );
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const x = (index: number) =>
    CHART_LEFT +
    (visiblePoints.length <= 1 ? plotWidth / 2 : (index / (visiblePoints.length - 1)) * plotWidth);
  const y = (rate: number) => CHART_TOP + plotHeight - (rate / 100) * plotHeight;
  const line = visiblePoints
    .map((point, index) => `${x(index)},${y(point.attendanceRate)}`)
    .join(' ');

  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 id="impact-trend-title" className="font-semibold">
        {t('impactTrendTitle')}
      </h3>
      <p id="impact-trend-description" className="mt-1 text-sm text-muted-foreground">
        {t('impactTrendDescription')}
      </p>
      <svg
        className="mt-4 h-auto w-full overflow-visible"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby="impact-trend-title impact-trend-description"
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={CHART_LEFT}
              x2={CHART_WIDTH - CHART_RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={CHART_LEFT - 8}
              y={y(tick) + 4}
              textAnchor="end"
              fill="var(--muted-foreground)"
              fontSize="12"
            >
              {tick}%
            </text>
          </g>
        ))}
        {line.length > 0 ? (
          <polyline
            points={line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {visiblePoints.map((point, index) => (
          <g key={point.monthStart}>
            <circle
              cx={x(index)}
              cy={y(point.attendanceRate)}
              r="5"
              fill="var(--background)"
              stroke="var(--primary)"
              strokeWidth="3"
            />
            <text
              x={x(index)}
              y={CHART_HEIGHT - 18}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize="12"
            >
              {formatter.format(new Date(`${point.monthStart}T00:00:00Z`))}
            </text>
          </g>
        ))}
      </svg>
      <table className="sr-only" data-testid="impact-trend-table">
        <caption>{t('impactTrendTableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('impactMonth')}</th>
            <th scope="col">{t('impactAttendanceRate')}</th>
            <th scope="col">{t('impactParticipants')}</th>
          </tr>
        </thead>
        <tbody>
          {visiblePoints.map((point) => (
            <tr key={point.monthStart}>
              <th scope="row">{formatter.format(new Date(`${point.monthStart}T00:00:00Z`))}</th>
              <td>{point.attendanceRate.toFixed(2)}%</td>
              <td>{point.participatingParticipantCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
