/**
 * The impact dashboard on the phone (RAPP-400), for `impact.view` holders, as
 * the web admin's dashboard, redesigned for small screens as the design doc
 * asks: a period (the last 7 days, the last 30 days, or this year), an
 * optional event category or collaborating entity, then one figure per card
 * with a small trend line. A tap on a card opens its full chart per month,
 * with the same numbers as a table. Categories, people and entities show as
 * bars with their numbers. Groups too small to count stay suppressed.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { BarRow, MonthBars, Sparkline } from '@/components/team/impact-charts';
import { continuousCorners } from '@/lib/continuous-corners';
import { IMPACT_PERIODS, impactPeriodRange, type ImpactPeriod } from '@/lib/impact-period';
import { useImpactReport } from '@/lib/team-impact';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImpactReport } from '@ramassa/shared/analytics';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

const TABLET_WIDTH = 768;
const ALL = 'all';
const PERIOD_KEYS: Readonly<Record<ImpactPeriod, string>> = {
  week: 'impactPeriodWeek',
  month: 'impactPeriodMonth',
  year: 'impactPeriodYear',
};

type TrendPoint = ImpactReport['participantTrend'][number];
type MetricKey = 'participants' | 'new' | 'participating' | 'rate';

interface Metric {
  readonly key: MetricKey;
  readonly labelKey: string;
  readonly value: string;
  /** The value per month, for the trend line and the full chart. */
  readonly trend: ((point: TrendPoint) => number) | null;
  readonly format: (value: number) => string;
}

const percent = (value: number) => `${value.toFixed(2)}%`;
const count = (value: number) => String(value);

function Section({
  testID,
  title,
  children,
}: {
  readonly testID?: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      testID={testID}
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function ChartSheet({
  metric,
  points,
  monthLabel,
  barLabel,
  onClose,
}: {
  readonly metric: Metric | null;
  readonly points: readonly TrendPoint[];
  readonly monthLabel: (monthStart: string) => string;
  /** One letter per month under the bars; the table gives the full names. */
  readonly barLabel: (monthStart: string) => string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('admin');
  const fontClass = useLanguageFontClass();
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const trend = metric?.trend ?? null;
  const rows =
    metric === null || trend === null
      ? []
      : points.map((point) => ({
          monthStart: point.monthStart,
          label: monthLabel(point.monthStart),
          short: barLabel(point.monthStart),
          value: trend(point),
        }));
  return (
    <Modal
      visible={metric !== null && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" testID="impact-chart-sheet">
        {metric === null ? null : (
          <ScrollView contentContainerClassName="gap-md p-lg">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('impactChartMonthly', { metric: t(metric.labelKey) })}
            </Text>
            {rows.length === 0 ? (
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('impactChartEmpty')}
              </Text>
            ) : (
              <>
                <MonthBars
                  bars={rows.map((row) => ({
                    key: row.monthStart,
                    label: row.short,
                    value: row.value,
                  }))}
                />
                <View accessibilityRole="list" className="gap-xs">
                  {rows.map((row) => (
                    <View
                      key={row.monthStart}
                      testID={`impact-chart-row-${row.monthStart}`}
                      accessible
                      accessibilityLabel={`${row.label}: ${metric.format(row.value)}`}
                      className="flex-row justify-between gap-sm border-b border-neutral-100 py-sm"
                    >
                      <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                        {row.label}
                      </Text>
                      <Text
                        className={`text-md font-semibold tabular-nums text-neutral-900 ${fontClass}`}
                      >
                        {metric.format(row.value)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            <PressableScale
              testID="impact-chart-close"
              accessibilityRole="button"
              accessibilityLabel={t('impactClose')}
              onPress={onClose}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
            >
              <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                {t('impactClose')}
              </Text>
            </PressableScale>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default function TeamImpactScreen() {
  const { t, i18n } = useTranslation('admin');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { width } = useWindowDimensions();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const [period, setPeriod] = useState<ImpactPeriod>('year');
  const [categoryId, setCategoryId] = useState(ALL);
  const [entityId, setEntityId] = useState(ALL);
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const range = useMemo(() => impactPeriodRange(period), [period]);
  const report = useImpactReport({
    ...range,
    ...(categoryId === ALL ? {} : { categoryId }),
    ...(entityId === ALL ? {} : { collaboratingEntityId: entityId }),
  });
  const data = report.data;
  const monthFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [language],
  );
  const narrowFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { month: 'narrow', timeZone: 'UTC' }),
    [language],
  );
  const monthLabel = (monthStart: string) =>
    monthFormat.format(new Date(`${monthStart}T00:00:00Z`));
  const barLabel = (monthStart: string) => narrowFormat.format(new Date(`${monthStart}T00:00:00Z`));
  const cardWidth = width >= TABLET_WIDTH ? '24%' : '48%';

  const metrics: readonly Metric[] =
    data === undefined || data.summary.suppressed
      ? []
      : [
          {
            key: 'participants',
            labelKey: 'impactParticipants',
            value: count(data.summary.participantCount),
            trend: null,
            format: count,
          },
          {
            key: 'new',
            labelKey: 'impactNewParticipants',
            value: count(data.summary.newParticipantCount),
            trend: (point) => point.newParticipantCount,
            format: count,
          },
          {
            key: 'participating',
            labelKey: 'impactParticipatingParticipants',
            value: count(data.summary.participatingParticipantCount),
            trend: (point) => point.participatingParticipantCount,
            format: count,
          },
          {
            key: 'rate',
            labelKey: 'impactAttendanceRate',
            value: percent(data.summary.attendanceRate),
            trend: (point) => point.attendanceRate,
            format: percent,
          },
        ];
  const trend = data?.participantTrend ?? [];

  const filterRow = (
    testIDPrefix: string,
    allLabel: string,
    selected: string,
    options: readonly { readonly id: string; readonly label: string }[],
    onSelect: (id: string) => void,
  ) => (
    // One line that scrolls sideways, so the figures stay near the top.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-sm"
    >
      {[{ id: ALL, label: allLabel }, ...options].map((option) => (
        <ChoiceOption
          key={option.id}
          testID={`${testIDPrefix}-${option.id}`}
          value={option.id}
          label={option.label}
          selected={option.id === selected}
          onSelect={onSelect}
          languageFontClass={fontClass}
        />
      ))}
    </ScrollView>
  );

  const suppressed = t('impactSuppressedValue');

  return (
    <SafeAreaView
      testID="team-impact"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-impact-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('impactReportTitle')}
            </Text>
            <Text
              testID="impact-period-range"
              className={`text-start text-md tabular-nums text-neutral-600 ${fontClass}`}
            >
              {t('impactReportPeriod', { start: range.startDate, end: range.endDate })}
            </Text>
          </View>

          <View className="gap-sm">
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('impactPeriod')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-sm"
            >
              {IMPACT_PERIODS.map((candidate) => (
                <ChoiceOption
                  key={candidate}
                  testID={`impact-period-${candidate}`}
                  value={candidate}
                  label={t(PERIOD_KEYS[candidate])}
                  selected={candidate === period}
                  onSelect={setPeriod}
                  languageFontClass={fontClass}
                />
              ))}
            </ScrollView>
            {data === undefined ? null : (
              <>
                <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
                  {t('filterCategory')}
                </Text>
                {filterRow(
                  'impact-category',
                  t('filterAllCategories'),
                  categoryId,
                  data.availableFilters.categories.map((category) => ({
                    id: category.id,
                    label: resolveLocalizedText(category.name, language)?.text ?? category.name.ca,
                  })),
                  setCategoryId,
                )}
                {data.availableFilters.entities.length === 0 ? null : (
                  <>
                    <Text
                      className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}
                    >
                      {t('filterEntity')}
                    </Text>
                    {filterRow(
                      'impact-entity',
                      t('filterAllEntities'),
                      entityId,
                      data.availableFilters.entities.map((entity) => ({
                        id: entity.id,
                        label: entity.name,
                      })),
                      setEntityId,
                    )}
                  </>
                )}
              </>
            )}
          </View>

          {report.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>
              {t('impactLoadFailed')}
            </Text>
          ) : data === undefined ? null : data.summary.suppressed ? (
            <Section testID="impact-suppressed" title={t('impactPrivacyTitle')}>
              <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
                {t('impactPrivacyDescription')}
              </Text>
            </Section>
          ) : (
            <>
              <View
                accessibilityLabel={t('impactSummary')}
                className="flex-row flex-wrap justify-between gap-y-sm"
              >
                {metrics.map((metric) => {
                  const values = metric.trend === null ? [] : trend.map(metric.trend);
                  const content = (
                    <View className="gap-xs">
                      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                        {t(metric.labelKey)}
                      </Text>
                      <Text
                        className={`text-start text-3xl font-bold tabular-nums text-neutral-900 ${fontClass}`}
                      >
                        {metric.value}
                      </Text>
                      <Sparkline values={values} />
                    </View>
                  );
                  const frame =
                    'min-h-recommended rounded-md border border-neutral-200 bg-white p-md';
                  return metric.trend === null ? (
                    <View
                      key={metric.key}
                      testID={`impact-card-${metric.key}`}
                      accessible
                      accessibilityLabel={`${t(metric.labelKey)}: ${metric.value}`}
                      style={[continuousCorners, { width: cardWidth }]}
                      className={frame}
                    >
                      {content}
                    </View>
                  ) : (
                    <PressableScale
                      key={metric.key}
                      testID={`impact-card-${metric.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${t(metric.labelKey)}: ${metric.value}`}
                      accessibilityHint={t('impactShowChart')}
                      onPress={() => setOpenMetric(metric.key)}
                      haptic="tapLight"
                      style={[continuousCorners, { width: cardWidth }]}
                      className={frame}
                    >
                      {content}
                    </PressableScale>
                  );
                })}
              </View>

              <Section testID="impact-categories" title={t('impactCategoryTitle')}>
                {data.categories.map((category) => (
                  <BarRow
                    key={category.categoryId}
                    testID={`impact-category-row-${category.categoryId}`}
                    label={
                      resolveLocalizedText(category.categoryName, language)?.text ??
                      category.categoryName.ca
                    }
                    value={`${category.participantCount} · ${percent(category.attendanceRate)}`}
                    share={
                      category.participantCount /
                      Math.max(1, ...data.categories.map((item) => item.participantCount))
                    }
                  />
                ))}
              </Section>

              <Section testID="impact-activity" title={t('impactActivityTitle')}>
                <View className="flex-row flex-wrap justify-between gap-y-sm">
                  {[
                    {
                      key: 'posts',
                      label: t('impactForumPosts'),
                      value: data.forumActivity.suppressed
                        ? suppressed
                        : count(data.forumActivity.postCount),
                    },
                    {
                      key: 'replies',
                      label: t('impactForumReplies'),
                      value: data.forumActivity.suppressed
                        ? suppressed
                        : count(data.forumActivity.replyCount),
                    },
                    {
                      key: 'referrals',
                      label: t('impactReferrals'),
                      value: data.referrals.suppressed
                        ? suppressed
                        : count(data.referrals.referralCount),
                    },
                    {
                      key: 'conversion',
                      label: t('impactReferralConversion'),
                      value: data.referrals.suppressed
                        ? suppressed
                        : percent(data.referrals.conversionRate),
                    },
                  ].map((item) => (
                    <View
                      key={item.key}
                      testID={`impact-activity-${item.key}`}
                      accessible
                      accessibilityLabel={`${item.label}: ${item.value}`}
                      className="gap-xs"
                      style={{ width: '48%' }}
                    >
                      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                        {item.label}
                      </Text>
                      <Text
                        className={`text-start text-xl font-bold tabular-nums text-neutral-900 ${fontClass}`}
                      >
                        {item.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </Section>

              {(
                [
                  ['impact-nationalities', 'impactNationalities', data.demographics.nationalities],
                  ['impact-age-bands', 'impactAgeBands', data.demographics.ageBands],
                ] as const
              ).map(([testID, titleKey, buckets]) => {
                const highest = Math.max(
                  1,
                  ...buckets.map((bucket) => (bucket.suppressed ? 0 : bucket.count)),
                );
                return (
                  <Section key={testID} testID={testID} title={t(titleKey)}>
                    {buckets.map((bucket) => (
                      <BarRow
                        key={bucket.label}
                        label={bucket.label}
                        value={bucket.suppressed ? suppressed : count(bucket.count)}
                        share={bucket.suppressed ? 0 : bucket.count / highest}
                      />
                    ))}
                  </Section>
                );
              })}

              {data.entities.length === 0 ? null : (
                <Section testID="impact-entities" title={t('impactEntitiesTitle')}>
                  {data.entities.map((entity) => (
                    <BarRow
                      key={entity.entityId}
                      label={entity.entityName}
                      value={
                        entity.suppressed
                          ? suppressed
                          : t('impactEntityValue', {
                              count: entity.participantCount,
                              rate: entity.attendanceRate.toFixed(2),
                            })
                      }
                      share={
                        entity.suppressed
                          ? 0
                          : entity.participantCount /
                            Math.max(
                              1,
                              ...data.entities.map((item) =>
                                item.suppressed ? 0 : item.participantCount,
                              ),
                            )
                      }
                    />
                  ))}
                </Section>
              )}

              <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                {t('impactFundingAcknowledgment')}
              </Text>
            </>
          )}
        </PageWidth>
      </ScrollView>
      <ChartSheet
        metric={metrics.find((metric) => metric.key === openMetric) ?? null}
        points={trend}
        monthLabel={monthLabel}
        barLabel={barLabel}
        onClose={() => setOpenMetric(null)}
      />
    </SafeAreaView>
  );
}
