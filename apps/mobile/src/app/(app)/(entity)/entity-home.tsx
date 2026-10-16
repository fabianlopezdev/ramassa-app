/**
 * The partner entity's Home on the phone (RAPP-410, RAPP-411), as the web
 * portal's impact page: the women her entity referred, how many are active,
 * how often they were present and the attendance rate, one figure per card
 * with a small trend line; the participation per month as bars with the same
 * numbers as a table; and the tracking of each referred woman. Under three
 * people the figures stay hidden, with the privacy note instead. The app lock
 * and sign-out close the screen, as she has no More tab.
 */
import { AppLockLink } from '@/components/auth/app-lock-link';
import { EntityLoadFailure, hasLoadFailed } from '@/components/entity/entity-load-failure';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { BarRow, MonthBars, Sparkline } from '@/components/team/impact-charts';
import { logout } from '@/lib/auth';
import { continuousCorners } from '@/lib/continuous-corners';
import { useEntityDashboard } from '@/lib/entity-portal';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

const TABLET_WIDTH = 768;

const percent = (value: number | null) => (value === null ? '' : `${value.toFixed(2)}%`);

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

export default function EntityHomeScreen() {
  const { t } = useTranslation('nav');
  const { t: tEntity, i18n } = useTranslation('entity-management');
  const { t: tProfile } = useTranslation('profile');
  const fontClass = useLanguageFontClass();
  const { width } = useWindowDimensions();
  const dashboard = useEntityDashboard();
  const data = dashboard.data;
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const monthFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [language],
  );
  const narrowFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { month: 'narrow', timeZone: 'UTC' }),
    [language],
  );
  const month = (start: string, format: Intl.DateTimeFormat) =>
    format.format(new Date(`${start}T00:00:00Z`));
  const cardWidth = width >= TABLET_WIDTH ? '24%' : '48%';
  const trend = data?.trend ?? [];
  const impact = data?.impact;

  const cards =
    impact === undefined || impact.suppressed
      ? []
      : [
          {
            key: 'referred',
            label: tEntity('referred'),
            value: String(impact.referredCount ?? 0),
            values: trend.map((point) => point.participantCount),
          },
          {
            key: 'active',
            label: tEntity('active'),
            value: String(impact.activeCount ?? 0),
            values: [],
          },
          {
            key: 'present',
            label: tEntity('present'),
            value: String(impact.attendancePresentCount ?? 0),
            values: trend.map((point) => point.attendancePresentCount),
          },
          {
            key: 'rate',
            label: tEntity('attendanceRate'),
            value: percent(impact.attendanceRate),
            values: trend.map((point) => point.attendanceRate),
          },
        ];

  return (
    <SafeAreaView
      testID="entity-home"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('entity.dashboard')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {tEntity('dashboardIntro')}
            </Text>
          </View>
          {hasLoadFailed(dashboard) ? <EntityLoadFailure query={dashboard} /> : null}

          {impact === undefined ? null : impact.suppressed ? (
            <Section testID="entity-impact-suppressed" title={tEntity('privacyTitle')}>
              <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
                {tEntity('privacyBody')}
              </Text>
            </Section>
          ) : (
            <>
              <View className="flex-row flex-wrap justify-between gap-y-sm">
                {cards.map((card) => (
                  <View
                    key={card.key}
                    testID={`entity-impact-${card.key}`}
                    accessible
                    accessibilityLabel={`${card.label}: ${card.value}`}
                    style={[continuousCorners, { width: cardWidth }]}
                    className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
                  >
                    <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                      {card.label}
                    </Text>
                    <Text
                      className={`text-start text-3xl font-bold tabular-nums text-neutral-900 ${fontClass}`}
                    >
                      {card.value}
                    </Text>
                    <Sparkline values={card.values} />
                  </View>
                ))}
              </View>

              {trend.length === 0 ? null : (
                <Section testID="entity-monthly" title={tEntity('monthlyTitle')}>
                  <MonthBars
                    bars={trend.map((point) => ({
                      key: point.monthStart,
                      label: month(point.monthStart, narrowFormat),
                      value: point.participantCount,
                    }))}
                  />
                  <View accessibilityRole="list" className="gap-xs">
                    {trend.map((point) => (
                      <View
                        key={point.monthStart}
                        testID={`entity-month-${point.monthStart}`}
                        accessible
                        className="flex-row justify-between gap-sm border-b border-neutral-100 py-sm"
                      >
                        <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                          {month(point.monthStart, monthFormat)}
                        </Text>
                        <Text
                          className={`text-md font-semibold tabular-nums text-neutral-900 ${fontClass}`}
                        >
                          {`${point.participantCount} · ${percent(point.attendanceRate)}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Section>
              )}
            </>
          )}

          {data === undefined ? null : (
            <Section testID="entity-tracking" title={tEntity('trackingTitle')}>
              {data.tracking.length === 0 ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {tEntity('trackingEmpty')}
                </Text>
              ) : (
                data.tracking.map((row) => (
                  <View
                    key={row.referralId}
                    testID={`entity-tracking-${row.referralId}`}
                    className="gap-xs"
                  >
                    <View className="flex-row flex-wrap items-center justify-between gap-sm">
                      <Text
                        className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}
                      >
                        {`${row.referredFirstName} ${row.referredLastName}`.trim()}
                      </Text>
                      <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>
                        {tEntity(`status.${row.status}`)}
                      </Text>
                    </View>
                    <BarRow
                      label={[
                        `${tEntity('present')}: ${row.attendancePresentCount}`,
                        `${tEntity('absent')}: ${row.attendanceAbsentCount}`,
                        `${tEntity('excused')}: ${row.attendanceExcusedCount}`,
                      ].join(' · ')}
                      value={percent(row.attendanceRate)}
                      share={row.attendanceRate / 100}
                    />
                  </View>
                ))
              )}
            </Section>
          )}

          <View className="gap-sm">
            <AppLockLink variant="button" />
            <PressableScale
              testID="entity-sign-out"
              accessibilityRole="button"
              accessibilityLabel={tProfile('signOutAction')}
              onPress={() => void logout()}
              haptic="tapLight"
              className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
            >
              <Text className={`text-md font-semibold text-primary-dark ${fontClass}`}>
                {tProfile('signOutAction')}
              </Text>
            </PressableScale>
          </View>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
