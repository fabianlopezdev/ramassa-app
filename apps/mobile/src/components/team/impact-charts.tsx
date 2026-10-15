/**
 * The impact dashboard's charts on the phone (RAPP-400): a small trend line
 * for a figure card, and bars for the full chart and the lists. The design
 * doc asks for bars where the web would use pies. The lines and bars are
 * hidden from screen readers, because every chart has its numbers as text
 * next to it or in a table below it. Months run in the reading direction, so
 * they go from right to left in Arabic and Persian.
 */
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { I18nManager, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { tokens } from '@ramassa/shared/tokens';

const SPARK_WIDTH = 96;
const SPARK_HEIGHT = 32;

/** A small trend line over the values in order; nothing below two values. */
export function Sparkline({ values }: { readonly values: readonly number[] }) {
  if (values.length < 2) return null;
  const highest = Math.max(...values, 1);
  const step = SPARK_WIDTH / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = I18nManager.isRTL ? SPARK_WIDTH - index * step : index * step;
      const y = SPARK_HEIGHT - 2 - (value / highest) * (SPARK_HEIGHT - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={SPARK_WIDTH} height={SPARK_HEIGHT}>
        <Polyline
          points={points}
          fill="none"
          stroke={tokens.colors.primary.DEFAULT}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

/** One labelled bar, as long as its share of the highest value. */
export function BarRow({
  testID,
  label,
  value,
  share,
}: {
  readonly testID?: string;
  readonly label: string;
  /** The value as shown, already formatted. */
  readonly value: string;
  /** From 0 to 1. */
  readonly share: number;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View testID={testID} className="gap-xs" accessible accessibilityLabel={`${label}: ${value}`}>
      <View className="flex-row items-center justify-between gap-sm">
        <Text className={`flex-1 text-start text-md text-neutral-800 ${fontClass}`}>{label}</Text>
        <Text className={`text-md font-semibold tabular-nums text-neutral-900 ${fontClass}`}>
          {value}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <View
          className="h-2 rounded-full bg-primary"
          style={{ width: `${Math.round(Math.min(Math.max(share, 0), 1) * 100)}%` }}
        />
      </View>
    </View>
  );
}

const CHART_HEIGHT = 160;

/** Vertical bars per month, with the month under each bar. */
export function MonthBars({
  bars,
}: {
  readonly bars: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: number;
  }[];
}) {
  const fontClass = useLanguageFontClass();
  const highest = Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-end gap-xs"
      style={{ height: CHART_HEIGHT + 24 }}
    >
      {bars.map((bar) => (
        <View key={bar.key} className="flex-1 items-center gap-xs">
          <View
            className="w-full rounded-t-md bg-primary"
            style={{ height: Math.max(2, (bar.value / highest) * CHART_HEIGHT) }}
          />
          <Text numberOfLines={1} className={`text-xs text-neutral-600 ${fontClass}`}>
            {bar.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
