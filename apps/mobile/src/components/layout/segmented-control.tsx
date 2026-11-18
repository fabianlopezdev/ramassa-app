import { Icon, type IconName } from '@/components/icons/icon';
import { RaisedPanel, useRaisedChoiceFaceStyle } from '@/components/layout/raised-surface';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { memo, useCallback, type JSX } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/**
 * One row of mutually exclusive views of the same screen: the events list or
 * calendar, the Comunitat segments, the participant segments. It is one raised
 * surface (RAPP-841) as tall as a raised choice, split by lines, and the chosen option fills with the
 * yellow the chosen filter chip uses. Every option has the same width and the
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

const styles = StyleSheet.create({
  count: { fontVariant: ['tabular-nums'] },
});

interface SegmentedControlOptionViewProps<Key extends string> extends SegmentedControlOption<Key> {
  readonly isSelected: boolean;
  /** Every option after the first draws the line that splits it from the one before. */
  readonly isFirst: boolean;
  /** The height of a raised choice, shared by every option. */
  readonly optionStyle: StyleProp<ViewStyle>;
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
  isFirst,
  optionStyle,
  languageFontClass,
  onSelect,
}: Omit<SegmentedControlOptionViewProps<Key>, 'key'> & { readonly optionKey: Key }) {
  const handlePress = useCallback(() => onSelect(optionKey), [onSelect, optionKey]);
  const visibleCount = count !== undefined && count > 0 ? count : null;
  const contentColor = isSelected ? tokens.colors.neutral[900] : tokens.colors.primary.dark;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={handlePress}
      haptic="selection"
      isSelected={isSelected}
      style={optionStyle}
      className={`relative flex-1 flex-row items-center justify-center gap-sm px-sm py-xs ${
        isFirst ? '' : 'border-s border-primary'
      }`}
    >
      <SelectionTransition
        active={isSelected}
        duration="base"
        className="absolute inset-0 bg-secondary"
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
  const optionStyle = useRaisedChoiceFaceStyle();
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      <RaisedPanel faceClassName="flex-row overflow-hidden">
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
            isFirst={index === 0}
            optionStyle={optionStyle}
            languageFontClass={languageFontClass}
            onSelect={onSelect}
          />
        ))}
      </RaisedPanel>
    </View>
  );
}
