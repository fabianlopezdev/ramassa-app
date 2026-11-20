import { Icon, iconArtworkMargin, type IconName } from '@/components/icons/icon';
import { EdgeMarks } from '@/components/layout/edge-marks';
import {
  RaisedSurfaceEdge,
  raisedSurfaceWrapperStyle,
  useRaisedChoiceFaceStyle,
} from '@/components/layout/raised-surface';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import { formatUnreadBadge } from '@/lib/unread-badge';
import { useCapToBaselineTrim } from '@/lib/use-cap-to-baseline-trim';
import { memo, useCallback, useMemo, type JSX } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/**
 * One row of mutually exclusive views of the same screen: the events list or
 * calendar, the Comunitat segments, the participant segments. It is one raised
 * bar (RAPP-841) as tall as a raised choice: one solid edge runs under it, and
 * every option is its own face on that edge, split from the next by a line.
 * Pressing an option sinks that face onto the edge like a key, while the rest
 * of the bar stays up. The chosen option fills with the yellow the chosen
 * filter chip uses.
 *
 * With two options the icon sits beside the label. From three, each option
 * is about a third of the screen, and a long word such as "Històries" would
 * break inside itself, so the icon goes above the label and the word gets the
 * option's whole width (RAPP-852). Stacked, the icon and the label are
 * centred by what is drawn: the icon gives back its artwork's empty margin
 * and the label is trimmed from its capitals to its baseline, so the space
 * above the icon matches the space below the word. That space is the one the
 * icon has in a one-line bar, so a stacked bar grows taller and keeps the
 * same breathing room at its edges. Every option has the same width and the
 * row stretches every option to the tallest one, so a label that wraps to two
 * lines keeps the row edge to edge with equal heights.
 *
 * An option's count is the circle cards and filter chips use for one
 * (RAPP-873), on the option's top edge near the end, from `EdgeMarks`. The
 * circles are drawn in a row laid over the bar, one cell per option, so the
 * options keep the layout they have without a count: wrapping each option
 * made the bar lose the height of an icon above its label. While any option
 * has a count, the bar keeps room above itself, so the circle is never cut
 * off by what holds it.
 */
export interface SegmentedControlOption<Key extends string> {
  readonly key: Key;
  readonly label: string;
  /** Screen-reader name when it should say more than the visible label. */
  readonly accessibilityLabel?: string;
  /** A count in a circle on the option's top edge when it is above zero. */
  readonly count?: number;
  /** Decorative icon before the label: players navigate by icon shape. */
  readonly symbol?: IconName;
  readonly testID?: string;
}

const { shadowInlineOffset, shadowBlockOffset } = tokens.languageChoice;
/** From this many options, the icon goes above the label. */
const STACKED_LAYOUT_MIN_OPTIONS = 3;
const OPTION_ICON_SIZE = tokens.fontSize['2xl'];

// The bar's outer corners belong to its first and last options, matching the
// `rounded-lg` of the edge under the bar.
const styles = StyleSheet.create({
  stackedIcon: { marginVertical: -iconArtworkMargin(OPTION_ICON_SIZE) },
  startCorners: {
    ...continuousCorners,
    borderTopStartRadius: tokens.radius.lg,
    borderBottomStartRadius: tokens.radius.lg,
  },
  endCorners: {
    ...continuousCorners,
    borderTopEndRadius: tokens.radius.lg,
    borderBottomEndRadius: tokens.radius.lg,
  },
});

interface SegmentedControlOptionViewProps<Key extends string> extends SegmentedControlOption<Key> {
  readonly isSelected: boolean;
  /** The last option closes the bar with its end border and sinks toward the end too. */
  readonly isLast: boolean;
  /** The icon above the label, for a bar of three or more options. */
  readonly isStacked: boolean;
  /** The height of a raised choice, with the bar's outer corners where this option has them. */
  readonly faceStyle: StyleProp<ViewStyle>;
  /** Those outer corners alone, so the yellow fill keeps inside the border. */
  readonly cornerStyle: StyleProp<ViewStyle>;
  readonly languageFontClass: string;
  readonly onSelect: (key: Key) => void;
}

const SegmentedControlOptionView = memo(function SegmentedControlOptionView<Key extends string>({
  optionKey,
  label,
  accessibilityLabel,
  symbol,
  testID,
  isSelected,
  isLast,
  isStacked,
  faceStyle,
  cornerStyle,
  languageFontClass,
  onSelect,
}: Omit<SegmentedControlOptionViewProps<Key>, 'key'> & { readonly optionKey: Key }) {
  const handlePress = useCallback(() => onSelect(optionKey), [onSelect, optionKey]);
  const contentColor = isSelected ? tokens.colors.neutral[900] : tokens.colors.primary.dark;
  const labelTrim = useCapToBaselineTrim();
  return (
    <PressableDepth
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={handlePress}
      haptic="selection"
      isSelected={isSelected}
      className="flex-1"
      faceStyle={faceStyle}
      // `grow`, with the height of its own content as the base: with `flex-1`
      // the face could lose the height of an icon above its label when the
      // list under the bar laid itself out again (RAPP-873).
      faceClassName={`relative grow items-center justify-center overflow-hidden border-y border-s border-primary bg-white px-sm ${
        isStacked ? 'gap-md' : 'flex-row gap-sm py-xs'
      } ${isLast ? 'border-e' : ''}`}
      inlineOffset={isLast ? shadowInlineOffset : 0}
      blockOffset={shadowBlockOffset}
      shadow={null}
    >
      <SelectionTransition
        active={isSelected}
        duration="base"
        className="absolute inset-0 bg-secondary"
        style={cornerStyle}
      />
      {symbol === undefined ? null : (
        <View style={isStacked ? styles.stackedIcon : undefined}>
          <Icon
            name={symbol}
            weight={isSelected ? 'boldDuotone' : 'linear'}
            size={OPTION_ICON_SIZE}
            color={contentColor}
          />
        </View>
      )}
      <View className="shrink flex-row items-center justify-center gap-xs">
        <Text
          numberOfLines={2}
          onTextLayout={isStacked ? labelTrim.onTextLayout : undefined}
          style={isStacked ? labelTrim.style : undefined}
          className={`shrink text-center text-lg font-bold ${
            isSelected ? 'text-neutral-900' : 'text-primary-dark'
          } ${languageFontClass}`}
        >
          {label}
        </Text>
      </View>
    </PressableDepth>
  );
}) as <Key extends string>(
  props: Omit<SegmentedControlOptionViewProps<Key>, 'key'> & { readonly optionKey: Key },
) => JSX.Element;

const OPTION_POSITIONS = ['only', 'first', 'middle', 'last'] as const;
type OptionPosition = (typeof OPTION_POSITIONS)[number];

const cornerStyleByPosition: Record<OptionPosition, StyleProp<ViewStyle>> = {
  only: [styles.startCorners, styles.endCorners],
  first: styles.startCorners,
  middle: undefined,
  last: styles.endCorners,
};

function optionPosition(index: number, lastIndex: number): OptionPosition {
  if (lastIndex === 0) return 'only';
  if (index === 0) return 'first';
  return index === lastIndex ? 'last' : 'middle';
}

export function SegmentedControl<Key extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  languageFontClass,
  testID,
}: {
  readonly options: readonly SegmentedControlOption<Key>[];
  readonly selected: Key;
  readonly onSelect: (key: Key) => void;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly testID?: string;
}) {
  const choiceFaceStyle = useRaisedChoiceFaceStyle();
  const isStacked = options.length >= STACKED_LAYOUT_MIN_OPTIONS;
  // The room between the border and the icon's drawing in a one-line bar.
  const stackedEdgeStyle = useMemo(
    () => ({
      paddingVertical:
        (choiceFaceStyle.minHeight - (OPTION_ICON_SIZE - 2 * iconArtworkMargin(OPTION_ICON_SIZE))) /
        2,
    }),
    [choiceFaceStyle.minHeight],
  );
  const positionStyles = useMemo(
    () =>
      Object.fromEntries(
        OPTION_POSITIONS.map((position) => [
          position,
          {
            cornerStyle: cornerStyleByPosition[position],
            faceStyle: [
              choiceFaceStyle,
              cornerStyleByPosition[position],
              isStacked ? stackedEdgeStyle : undefined,
            ],
          },
        ]),
      ) as Record<
        OptionPosition,
        { cornerStyle: StyleProp<ViewStyle>; faceStyle: StyleProp<ViewStyle> }
      >,
    [choiceFaceStyle, isStacked, stackedEdgeStyle],
  );
  const lastIndex = options.length - 1;
  const hasMarks = options.some(
    (option) => option.count !== undefined && formatUnreadBadge(option.count) !== null,
  );
  const bar = (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={raisedSurfaceWrapperStyle}
      className="relative flex-row"
    >
      <RaisedSurfaceEdge />
      {options.map((option, index) => (
        <SegmentedControlOptionView
          key={option.key}
          optionKey={option.key}
          label={option.label}
          accessibilityLabel={option.accessibilityLabel}
          symbol={option.symbol}
          testID={option.testID}
          isSelected={selected === option.key}
          isLast={index === lastIndex}
          isStacked={isStacked}
          {...positionStyles[optionPosition(index, lastIndex)]}
          languageFontClass={languageFontClass}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
  if (!hasMarks) return bar;
  // The circle rises above the room `EdgeMarks` keeps, and a scroll view or
  // the screen above would cut it, so the bar keeps the rest, as the filter
  // chips do. The inner room is the one `EdgeMarks` keeps in each cell, so a
  // cell's top edge line is the bar's top edge.
  return (
    <View className="pt-sm">
      <View className="relative pt-sm">
        {bar}
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-0 flex-row"
        >
          {options.map((option) => (
            <EdgeMarks
              key={option.key}
              count={option.count === undefined ? null : formatUnreadBadge(option.count)}
              fill
            >
              <View className="flex-1" />
            </EdgeMarks>
          ))}
        </View>
      </View>
    </View>
  );
}
