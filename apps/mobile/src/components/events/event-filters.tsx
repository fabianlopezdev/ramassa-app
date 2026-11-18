import { FilterChips } from '@/components/layout/filter-chips';
import { SegmentedControl } from '@/components/layout/segmented-control';
import { useMemo } from 'react';
import type { PlayerEventCategoryFilter } from '@ramassa/shared/events';

export interface PlayerEventFilterOption {
  readonly id: string;
  readonly label: string;
}

/** The activity categories on Activitats, as the shared filter chips (RAPP-829). */
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
    () =>
      [{ id: 'all', label: allLabel }, ...categories].map((option) => ({
        ...option,
        testID: `event-filter-${option.id}`,
      })),
    [allLabel, categories],
  );
  return (
    <FilterChips
      options={options}
      selected={selected}
      accessibilityLabel={accessibilityLabel}
      languageFontClass={languageFontClass}
      onSelect={onSelect}
    />
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
  const options = useMemo(
    () =>
      [
        {
          key: 'list',
          label: listLabel,
          accessibilityLabel: listAccessibilityLabel,
          symbol: 'list',
        },
        {
          key: 'calendar',
          label: calendarLabel,
          accessibilityLabel: calendarAccessibilityLabel,
          symbol: 'calendar',
        },
      ] as const,
    [calendarAccessibilityLabel, calendarLabel, listAccessibilityLabel, listLabel],
  );
  return (
    <SegmentedControl
      options={options}
      selected={selected}
      onSelect={onSelect}
      accessibilityLabel={accessibilityLabel}
      languageFontClass={languageFontClass}
    />
  );
}
