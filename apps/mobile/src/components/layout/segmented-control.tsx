import { Icon, type IconName } from '@/components/icons/icon';
import {
  RaisedSurfaceEdge,
  raisedSurfaceWrapperStyle,
  useRaisedChoiceFaceStyle,
} from '@/components/layout/raised-surface';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
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
 * filter chip uses. Every option has the same width and the
 * row stretches every option to the tallest one, so a label that wraps to two
 * lines keeps the row edge to edge with equal heights.
 */
export interface SegmentedControlOption<Key extends string> {
  readonly key: Key;
  readonly label: string;
  /** Screen-reader name when it should say more than the visible label. */
  readonly accessibilityLabel?: string;
  /** A count shown after the label when it is above zero. */
  readonly count?: number;
  /** Decorative icon before the label: players navigate by icon shape. */
  readonly symbol?: IconName;
  readonly testID?: string;
}

const { shadowInlineOffset, shadowBlockOffset } = tokens.languageChoice;

// The bar's outer corners belong to its first and last options, matching the
// `rounded-lg` of the edge under the bar.
const styles = StyleSheet.create({
  count: { fontVariant: ['tabular-nums'] },
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
  count,
  symbol,
  testID,
  isSelected,
  isLast,
  faceStyle,
  cornerStyle,
  languageFontClass,
  onSelect,
}: Omit<SegmentedControlOptionViewProps<Key>, 'key'> & { readonly optionKey: Key }) {
  const handlePress = useCallback(() => onSelect(optionKey), [onSelect, optionKey]);
  const visibleCount = count !== undefined && count > 0 ? count : null;
  const contentColor = isSelected ? tokens.colors.neutral[900] : tokens.colors.primary.dark;
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
      faceClassName={`relative flex-1 flex-row items-center justify-center gap-sm overflow-hidden border-y border-s border-primary bg-white px-sm py-xs ${
        isLast ? 'border-e' : ''
      }`}
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
        <Icon
          name={symbol}
          weight={isSelected ? 'boldDuotone' : 'linear'}
          size={tokens.fontSize['2xl']}
          color={contentColor}
        />
      )}
      <Text
        numberOfLines={2}
        className={`shrink text-center text-lg font-bold ${
          isSelected ? 'text-neutral-900' : 'text-primary-dark'
        } ${languageFontClass}`}
      >
        {label}
      </Text>
      {visibleCount === null ? null : (
        <View
          accessible={false}
          className="items-center justify-center rounded-full bg-primary-dark px-sm"
        >
          <Text
            style={styles.count}
            className={`text-sm font-bold text-white ${languageFontClass}`}
          >
            {visibleCount}
          </Text>
        </View>
      )}
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
  const positionStyles = useMemo(
    () =>
      Object.fromEntries(
        OPTION_POSITIONS.map((position) => [
          position,
          {
            cornerStyle: cornerStyleByPosition[position],
            faceStyle: [choiceFaceStyle, cornerStyleByPosition[position]],
          },
        ]),
      ) as Record<
        OptionPosition,
        { cornerStyle: StyleProp<ViewStyle>; faceStyle: StyleProp<ViewStyle> }
      >,
    [choiceFaceStyle],
  );
  const lastIndex = options.length - 1;
  return (
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
          count={option.count}
          symbol={option.symbol}
          testID={option.testID}
          isSelected={selected === option.key}
          isLast={index === lastIndex}
          {...positionStyles[optionPosition(index, lastIndex)]}
          languageFontClass={languageFontClass}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
