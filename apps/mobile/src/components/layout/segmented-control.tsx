import { PressableScale } from '@/components/motion/pressable-scale';
import {
  composeContinuousViewStyle,
  composeViewStyles,
  continuousCorners,
} from '@/lib/continuous-corners';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo, useCallback, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/**
 * One row of mutually exclusive views of the same screen: the events list or
 * month, the Comunitat segments, the participant segments. Every option has the
 * same width and the row stretches every option to the tallest one, so a label
 * that wraps to two lines keeps the row edge to edge with equal heights.
 */
export interface SegmentedControlOption<Key extends string> {
  readonly key: Key;
  readonly label: string;
  /** Screen-reader name when it should say more than the visible label. */
  readonly accessibilityLabel?: string;
  /** A count shown after the label when it is above zero. */
  readonly count?: number;
  /** Decorative icon above the label: players navigate by icon shape. */
  readonly symbol?: SymbolViewProps['name'];
  readonly testID?: string;
}

const styles = StyleSheet.create({
  option: {
    minHeight: tokens.tapTarget.recommended,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  optionSelected: { backgroundColor: tokens.colors.white },
  count: { fontVariant: ['tabular-nums'] },
});
const optionStyle = composeContinuousViewStyle(styles.option);
const selectedOptionStyle = composeViewStyles(optionStyle, styles.optionSelected);

interface SegmentedControlOptionViewProps<Key extends string> extends SegmentedControlOption<Key> {
  readonly isSelected: boolean;
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
  languageFontClass,
  onSelect,
}: Omit<SegmentedControlOptionViewProps<Key>, 'key'> & { readonly optionKey: Key }) {
  const handlePress = useCallback(() => onSelect(optionKey), [onSelect, optionKey]);
  const visibleCount = count !== undefined && count > 0 ? count : null;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={handlePress}
      haptic="selection"
      isSelected={isSelected}
      style={isSelected ? selectedOptionStyle : optionStyle}
      className={`min-h-recommended flex-1 items-center justify-center gap-xs rounded-sm px-sm py-xs ${
        isSelected ? 'bg-white' : ''
      }`}
    >
      {symbol === undefined ? null : (
        <SymbolView
          accessible={false}
          name={symbol}
          size={tokens.fontSize.xl}
          tintColor={isSelected ? tokens.colors.primary.dark : tokens.colors.neutral[600]}
        />
      )}
      <View className="flex-row items-center justify-center gap-xs">
        <Text
          numberOfLines={2}
          className={`shrink text-center text-md font-semibold ${
            isSelected ? 'text-primary-dark' : 'text-neutral-600'
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
      </View>
    </PressableScale>
  );
}) as <Key extends string>(
  props: Omit<SegmentedControlOptionViewProps<Key>, 'key'> & { readonly optionKey: Key },
) => JSX.Element;

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
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className="flex-row rounded-md bg-neutral-100 p-xs"
      style={continuousCorners}
    >
      {options.map((option) => (
        <SegmentedControlOptionView
          key={option.key}
          optionKey={option.key}
          label={option.label}
          accessibilityLabel={option.accessibilityLabel}
          count={option.count}
          symbol={option.symbol}
          testID={option.testID}
          isSelected={selected === option.key}
          languageFontClass={languageFontClass}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
