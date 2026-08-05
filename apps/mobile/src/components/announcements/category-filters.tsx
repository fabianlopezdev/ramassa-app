import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import type { TFunction } from 'i18next';
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
            <PressableScale
              key={filter}
              accessibilityLabel={label}
              onPress={() => onSelect(filter)}
              haptic="selection"
              isSelected={isSelected}
              style={continuousCorners}
              className={`min-h-recommended flex-row items-center gap-sm rounded-full border px-md ${
                isSelected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
              }`}
            >
              <View className={`h-sm w-sm rounded-full ${categoryDotClass(filter)}`} />
              <Text
                className={`text-md font-medium ${
                  isSelected ? 'text-white' : 'text-neutral-800'
                } ${languageFontClass}`}
              >
                {label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
