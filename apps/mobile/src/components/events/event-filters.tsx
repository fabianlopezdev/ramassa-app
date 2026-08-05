import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { StyleSheet, Text, View } from 'react-native';
import type { EventCategoryColor, PlayerEventCategoryFilter } from '@ramassa/shared/events';
import { tokens } from '@ramassa/shared/tokens';
import { eventCategoryColor } from './event-card';

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

export interface PlayerEventFilterOption {
  readonly id: string;
  readonly label: string;
  readonly color: EventCategoryColor;
}

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
  const options = [{ id: 'all', label: allLabel, color: 'primary' as const }, ...categories];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      <View className="flex-row flex-wrap gap-sm">
        {options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <PressableScale
              key={option.id}
              testID={`event-filter-${option.id}`}
              accessibilityLabel={option.label}
              onPress={() => onSelect(option.id)}
              haptic="selection"
              isSelected={isSelected}
              style={[
                continuousCorners,
                styles.filterOption,
                isSelected ? styles.filterOptionSelected : styles.filterOptionIdle,
              ]}
              className={`min-h-recommended flex-row items-center gap-sm rounded-full border px-md ${
                isSelected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
              }`}
            >
              <View
                className="h-sm w-sm rounded-full"
                style={{ backgroundColor: eventCategoryColor(option.color) }}
              />
              <Text
                className={`text-md font-medium ${
                  isSelected ? 'text-white' : 'text-neutral-800'
                } ${languageFontClass}`}
              >
                {option.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
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
      {(
        [
          ['list', listLabel, listAccessibilityLabel],
          ['calendar', calendarLabel, calendarAccessibilityLabel],
        ] as const
      ).map(([value, label, optionAccessibilityLabel]) => {
        const isSelected = selected === value;
        return (
          <PressableScale
            key={value}
            accessibilityLabel={optionAccessibilityLabel}
            onPress={() => onSelect(value)}
            haptic="selection"
            isSelected={isSelected}
            style={[
              continuousCorners,
              styles.viewOption,
              isSelected ? styles.viewOptionSelected : undefined,
            ]}
            className={`min-h-recommended flex-1 items-center justify-center rounded-sm px-md ${
              isSelected ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-md font-semibold ${
                isSelected ? 'text-primary-dark' : 'text-neutral-600'
              } ${languageFontClass}`}
            >
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
