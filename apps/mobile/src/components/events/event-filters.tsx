import { FilterChips } from '@/components/layout/filter-chips';
import { SegmentedControl } from '@/components/layout/segmented-control';
import { useMemo } from 'react';
import { eventCategoryPaletteColor, type PlayerEventCategoryFilter } from '@ramassa/shared/events';

export interface PlayerEventFilterOption {
  readonly id: string;
  readonly label: string;
  /** The category's stored colour, as `event_categories.color` holds it. */
  readonly color: string;
}

/**
 * The activity categories on Activitats, as the shared filter chips (RAPP-829),
 * each tinted by its category's colour on the shared palette like the Avisos
 * and Comunitat filters (RAPP-909). "Tot" stays white.
 */
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
    () => [
      { id: 'all', label: allLabel, testID: 'event-filter-all' },
      ...categories.map(({ id, label, color }) => ({
        id,
        label,
        tone: eventCategoryPaletteColor(color),
        testID: `event-filter-${id}`,
      })),
    ],
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
