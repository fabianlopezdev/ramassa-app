import { PressableScale } from '@/components/motion/pressable-scale';
import {
  composeContinuousViewStyle,
  composeViewStyles,
  continuousCorners,
} from '@/lib/continuous-corners';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EventCategoryColor, PlayerEventCategoryFilter } from '@ramassa/shared/events';
import { tokens } from '@ramassa/shared/tokens';
import { eventCategoryBackgroundStyle } from './event-card';

const styles = StyleSheet.create({
  filterOption: {
    minHeight: tokens.tapTarget.recommended,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
  },
  filterOptionSelected: {
    borderColor: tokens.colors.primary.DEFAULT,
    backgroundColor: tokens.colors.primary.DEFAULT,
  },
  filterOptionIdle: {
    borderColor: tokens.colors.neutral[300],
    backgroundColor: tokens.colors.white,
  },
  viewOption: {
    minHeight: tokens.tapTarget.recommended,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
  },
  viewOptionSelected: { backgroundColor: tokens.colors.white },
});
const selectedFilterOptionStyle = composeViewStyles(
  styles.filterOption,
  styles.filterOptionSelected,
);
const idleFilterOptionStyle = composeViewStyles(styles.filterOption, styles.filterOptionIdle);
const viewOptionStyle = composeContinuousViewStyle(styles.viewOption);
const selectedViewOptionStyle = composeViewStyles(viewOptionStyle, styles.viewOptionSelected);

export interface PlayerEventFilterOption {
  readonly id: string;
  readonly label: string;
  readonly color: EventCategoryColor;
}

interface EventCategoryOptionProps extends PlayerEventFilterOption {
  readonly isSelected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (category: PlayerEventCategoryFilter) => void;
}

const EventCategoryOption = memo(function EventCategoryOption({
  id,
  label,
  color,
  isSelected,
  languageFontClass,
  onSelect,
}: EventCategoryOptionProps) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <PressableScale
      testID={`event-filter-${id}`}
      accessibilityRole="radio"
      accessibilityLabel={label}
      onPress={handlePress}
      haptic="selection"
      isSelected={isSelected}
      style={isSelected ? selectedFilterOptionStyle : idleFilterOptionStyle}
      className={`min-h-recommended flex-row items-center gap-sm rounded-full border px-md ${
        isSelected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
      }`}
    >
      <View
        accessible={false}
        className="h-sm w-sm rounded-full"
        style={eventCategoryBackgroundStyle(color)}
      />
      <Text
        className={`text-md font-medium ${
          isSelected ? 'text-white' : 'text-neutral-800'
        } ${languageFontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
});

export function EventCategoryFilters({
  categories,
  selected,
  allLabel,
  accessibilityLabel,
  languageFontClass,
  onSelect,
}: {
  readonly categories: readonly PlayerEventFilterOption[];
  readonly selected: PlayerEventCategoryFilter;
  readonly allLabel: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onSelect: (category: PlayerEventCategoryFilter) => void;
}) {
  const options = useMemo(
    () => [{ id: 'all', label: allLabel, color: 'primary' as const }, ...categories],
    [allLabel, categories],
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      <View className="flex-row flex-wrap gap-sm">
        {options.map((option) => (
          <EventCategoryOption
            key={option.id}
            {...option}
            isSelected={selected === option.id}
            languageFontClass={languageFontClass}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

function EventViewOption({
  value,
  label,
  accessibilityLabel,
  selected,
  languageFontClass,
  onSelect,
}: {
  readonly value: 'list' | 'calendar';
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (view: 'list' | 'calendar') => void;
}) {
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      haptic="selection"
      isSelected={selected}
      style={selected ? selectedViewOptionStyle : viewOptionStyle}
      className={`min-h-recommended flex-1 items-center justify-center rounded-sm px-md ${
        selected ? 'bg-white' : ''
      }`}
    >
      <Text
        className={`text-md font-semibold ${
          selected ? 'text-primary-dark' : 'text-neutral-600'
        } ${languageFontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function EventViewToggle({
  selected,
  listLabel,
  calendarLabel,
  listAccessibilityLabel,
  calendarAccessibilityLabel,
  accessibilityLabel,
  languageFontClass,
  onSelect,
}: {
  readonly selected: 'list' | 'calendar';
  readonly listLabel: string;
  readonly calendarLabel: string;
  readonly listAccessibilityLabel: string;
  readonly calendarAccessibilityLabel: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onSelect: (view: 'list' | 'calendar') => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className="flex-row rounded-md bg-neutral-100 p-xs"
      style={continuousCorners}
    >
      <EventViewOption
        value="list"
        label={listLabel}
        accessibilityLabel={listAccessibilityLabel}
        selected={selected === 'list'}
        languageFontClass={languageFontClass}
        onSelect={onSelect}
      />
      <EventViewOption
        value="calendar"
        label={calendarLabel}
        accessibilityLabel={calendarAccessibilityLabel}
        selected={selected === 'calendar'}
        languageFontClass={languageFontClass}
        onSelect={onSelect}
      />
    </View>
  );
}
