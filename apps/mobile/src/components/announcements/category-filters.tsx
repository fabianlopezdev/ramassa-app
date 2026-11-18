import { FilterChips } from '@/components/layout/filter-chips';
import type { RaisedTone } from '@/components/layout/raised-surface';
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
        tone: filter === 'all' ? undefined : announcementCategoryTone(filter),
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
