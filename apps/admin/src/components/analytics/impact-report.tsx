import { useTranslation } from 'react-i18next';
import type { ImpactReport } from '@ramassa/shared/analytics';
import { resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';
import { ImpactTrendChart } from './impact-trend-chart';

function MetricCard({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5" data-testid={testId}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DemographicList({
  title,
  buckets,
  testId,
}: {
  readonly title: string;
  readonly buckets: ImpactReport['demographics']['nationalities'];
  readonly testId: string;
}) {
  const { t } = useTranslation('admin');
  return (
    <section className="rounded-xl border bg-card p-5" data-testid={testId}>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 divide-y">
        {buckets.map((bucket) => (
          <li key={bucket.label} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span>{bucket.label}</span>
            <span className="font-medium tabular-nums">
              {bucket.suppressed ? t('impactSuppressedValue') : bucket.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImpactReport({ report }: { readonly report: ImpactReport }) {
  const { t, i18n } = useTranslation('admin');
  const language = (i18n?.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const summary = report.summary;

  if (summary.suppressed) {
    return (
      <section className="rounded-xl border bg-card p-6" data-testid="impact-suppressed">
        <h2 className="font-semibold">{t('impactPrivacyTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('impactPrivacyDescription')}</p>
      </section>
    );
  }

  return (
    <article
      className="impact-print-report flex w-full flex-col gap-6"
      aria-labelledby="impact-report-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="impact-report-title" className="text-xl font-semibold">
            {t('impactReportTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('impactReportPeriod', {
              start: report.period.startDate,
              end: report.period.endDate,
            })}
          </p>
        </div>
        <p className="max-w-md text-sm text-muted-foreground" data-testid="generalitat-funding">
          {t('impactFundingAcknowledgment')}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('impactSummary')}>
        <MetricCard
          label={t('impactParticipants')}
          value={String(summary.participantCount)}
          testId="impact-participants"
        />
        <MetricCard
          label={t('impactNewParticipants')}
          value={String(summary.newParticipantCount)}
          testId="impact-new-participants"
        />
        <MetricCard
          label={t('impactParticipatingParticipants')}
          value={String(summary.participatingParticipantCount)}
          testId="impact-participating"
        />
        <MetricCard
          label={t('impactAttendanceRate')}
          value={`${summary.attendanceRate.toFixed(2)}%`}
          testId="impact-attendance-rate"
        />
      </section>

      <ImpactTrendChart points={report.participantTrend} />

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{t('impactCategoryTitle')}</h3>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b text-start text-muted-foreground">
                <th className="pb-2 text-start" scope="col">
                  {t('impactCategory')}
                </th>
                <th className="pb-2 text-end" scope="col">
                  {t('impactParticipants')}
                </th>
                <th className="pb-2 text-end" scope="col">
                  {t('impactAttendanceRate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map((category) => (
                <tr key={category.categoryId} className="border-b last:border-0">
                  <th className="py-3 text-start font-medium" scope="row">
                    {resolveLocalizedText(category.categoryName, language)?.text ??
                      category.categoryName.ca}
                  </th>
                  <td className="py-3 text-end tabular-nums">{category.participantCount}</td>
                  <td className="py-3 text-end tabular-nums">
                    {category.attendanceRate.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{t('impactActivityTitle')}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('impactForumPosts')}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {report.forumActivity.suppressed
                  ? t('impactSuppressedValue')
                  : report.forumActivity.postCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('impactForumReplies')}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {report.forumActivity.suppressed
                  ? t('impactSuppressedValue')
                  : report.forumActivity.replyCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('impactReferrals')}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {report.referrals.suppressed
                  ? t('impactSuppressedValue')
                  : report.referrals.referralCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('impactReferralConversion')}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {report.referrals.suppressed
                  ? t('impactSuppressedValue')
                  : `${report.referrals.conversionRate.toFixed(2)}%`}
              </dd>
            </div>
          </dl>
        </section>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <DemographicList
          title={t('impactNationalities')}
          buckets={report.demographics.nationalities}
          testId="impact-demographic-nationalities"
        />
        <DemographicList
          title={t('impactAgeBands')}
          buckets={report.demographics.ageBands}
          testId="impact-demographic-age-bands"
        />
      </section>

      {report.entities.length > 0 ? (
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{t('impactEntitiesTitle')}</h3>
          <ul className="mt-3 divide-y">
            {report.entities.map((entity) => (
              <li
                key={entity.entityId}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <span className="font-medium">{entity.entityName}</span>
                <span className="tabular-nums">
                  {entity.suppressed
                    ? t('impactSuppressedValue')
                    : t('impactEntityValue', {
                        count: entity.participantCount,
                        rate: entity.attendanceRate.toFixed(2),
                      })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
