import { PressableScale } from '@/components/motion/pressable-scale';
import type { TFunction } from 'i18next';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import {
  ANNOUNCEMENT_CATEGORIES,
  type AnnouncementCategory,
  type PlayerAnnouncementCategoryFilter,
} from '@ramassa/shared/announcements';

const FILTERS: readonly PlayerAnnouncementCategoryFilter[] = ['all', ...ANNOUNCEMENT_CATEGORIES];

function categoryLabel(filter: PlayerAnnouncementCategoryFilter, t: TFunction): string {
  return filter === 'all' ? t('filterAll') : t(`category.${filter}`);
}

function categoryDotClass(category: PlayerAnnouncementCategoryFilter): string {
  switch (category) {
    case 'training':
      return 'bg-primary';
    case 'social':
      return 'bg-secondary-dark';
    case 'urgent':
      return 'bg-error';
    case 'info':
      return 'bg-info';
    case 'all':
      return 'bg-neutral-500';
  }
}

export function announcementCategoryLabel(category: AnnouncementCategory, t: TFunction): string {
  return t(`category.${category}`);
}

export interface CategoryFiltersProps {
  readonly selected: PlayerAnnouncementCategoryFilter;
  readonly onSelect: (category: PlayerAnnouncementCategoryFilter) => void;
  readonly t: TFunction;
  readonly languageFontClass: string;
}

const CategoryFilterOption = memo(function CategoryFilterOption({
  filter,
  label,
  isSelected,
  languageFontClass,
  onSelect,
}: {
  readonly filter: PlayerAnnouncementCategoryFilter;
  readonly label: string;
  readonly isSelected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (category: PlayerAnnouncementCategoryFilter) => void;
}) {
  const handlePress = useCallback(() => onSelect(filter), [filter, onSelect]);
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      onPress={handlePress}
      haptic="selection"
      isSelected={isSelected}
      className={`min-h-recommended flex-row items-center gap-sm rounded-full border px-md ${
        isSelected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
      }`}
    >
      <View accessible={false} className={`h-sm w-sm rounded-full ${categoryDotClass(filter)}`} />
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

export function CategoryFilters({
  selected,
  onSelect,
  t,
  languageFontClass,
}: CategoryFiltersProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('filterLabel')}>
      <View className="flex-row flex-wrap gap-sm">
        {FILTERS.map((filter) => {
          const label = categoryLabel(filter, t);
          const isSelected = selected === filter;
          return (
            <CategoryFilterOption
              key={filter}
              filter={filter}
              label={label}
              isSelected={isSelected}
              languageFontClass={languageFontClass}
              onSelect={onSelect}
            />
          );
        })}
      </View>
    </View>
  );
}
