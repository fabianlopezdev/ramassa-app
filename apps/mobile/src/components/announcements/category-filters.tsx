import { FilterChips } from '@/components/layout/filter-chips';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import {
  ANNOUNCEMENT_CATEGORIES,
  type AnnouncementCategory,
  type PlayerAnnouncementCategoryFilter,
} from '@ramassa/shared/announcements';

const FILTERS: readonly PlayerAnnouncementCategoryFilter[] = ['all', ...ANNOUNCEMENT_CATEGORIES];

export function announcementCategoryLabel(category: AnnouncementCategory, t: TFunction): string {
  return t(`category.${category}`);
}

export interface CategoryFiltersProps {
  readonly selected: PlayerAnnouncementCategoryFilter;
  readonly onSelect: (category: PlayerAnnouncementCategoryFilter) => void;
  readonly t: TFunction;
  readonly languageFontClass: string;
}

/** The announcement categories on Inici, as the shared filter chips (RAPP-829). */
export function CategoryFilters({
  selected,
  onSelect,
  t,
  languageFontClass,
}: CategoryFiltersProps) {
  const options = useMemo(
    () =>
      FILTERS.map((filter) => ({
        id: filter,
        label: filter === 'all' ? t('filterAll') : announcementCategoryLabel(filter, t),
      })),
    [t],
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
