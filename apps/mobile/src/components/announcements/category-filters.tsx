import { FilterChips } from '@/components/layout/filter-chips';
import type { RaisedTone } from '@/components/layout/raised-surface';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import {
  ANNOUNCEMENT_CATEGORIES,
  type AnnouncementCategory,
  type PlayerAnnouncementCategoryFilter,
} from '@ramassa/shared/announcements';

/** How many of her new announcements each kind holds (RAPP-848). */
export type NewAnnouncementCounts = ReadonlyMap<AnnouncementCategory, number>;

export function countNewAnnouncements(
  announcements: readonly { readonly id: string; readonly category: AnnouncementCategory }[],
  newIds: ReadonlySet<string>,
): NewAnnouncementCounts {
  const counts = new Map<AnnouncementCategory, number>();
  for (const announcement of announcements) {
    if (!newIds.has(announcement.id)) continue;
    counts.set(announcement.category, (counts.get(announcement.category) ?? 0) + 1);
  }
  return counts;
}

/** "Tot" first, then the kinds with something new, then the rest, each in the usual order. */
function orderedFilters(newCounts: NewAnnouncementCounts): PlayerAnnouncementCategoryFilter[] {
  const withNew = ANNOUNCEMENT_CATEGORIES.filter((category) => (newCounts.get(category) ?? 0) > 0);
  const without = ANNOUNCEMENT_CATEGORIES.filter((category) => !withNew.includes(category));
  return ['all', ...withNew, ...without];
}

export function announcementCategoryLabel(category: AnnouncementCategory, t: TFunction): string {
  return t(`category.${category}`);
}

/** The colour of each kind, the one its dot had before the raised style (RAPP-845). */
export function announcementCategoryTone(category: AnnouncementCategory): RaisedTone {
  switch (category) {
    case 'training':
      return 'primary';
    case 'social':
      return 'secondary';
    case 'urgent':
      return 'error';
    case 'info':
      return 'info';
  }
}

export interface CategoryFiltersProps {
  readonly selected: PlayerAnnouncementCategoryFilter;
  readonly newCounts: NewAnnouncementCounts;
  readonly onSelect: (category: PlayerAnnouncementCategoryFilter) => void;
  readonly t: TFunction;
  readonly languageFontClass: string;
}

/**
 * The announcement categories on Inici, as the shared filter chips (RAPP-829).
 * A kind with new announcements she has not opened comes first after "Tot"
 * and carries their number (RAPP-848).
 */
export function CategoryFilters({
  selected,
  newCounts,
  onSelect,
  t,
  languageFontClass,
}: CategoryFiltersProps) {
  const options = useMemo(
    () =>
      orderedFilters(newCounts).map((filter) => {
        if (filter === 'all') return { id: filter, label: t('filterAll') };
        const label = announcementCategoryLabel(filter, t);
        const newCount = newCounts.get(filter) ?? 0;
        return {
          id: filter,
          label,
          tone: announcementCategoryTone(filter),
          count: newCount > 0 ? String(newCount) : null,
          accessibilityLabel:
            newCount > 0 ? `${label}, ${t('filterNewCount', { count: newCount })}` : label,
        };
      }),
    [newCounts, t],
  );
  return (
    <FilterChips
      options={options}
      selected={selected}
      accessibilityLabel={t('filterLabel')}
      languageFontClass={languageFontClass}
      onSelect={onSelect}
    />
  );
}
