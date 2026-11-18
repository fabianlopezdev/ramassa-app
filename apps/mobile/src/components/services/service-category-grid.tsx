import type { IconName } from '@/components/icons/icon';
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback } from 'react';
import { View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { serviceCategoryWash, type AdminServiceCategory } from '@ramassa/shared/services';

const categoryIcons: Readonly<Record<string, IconName>> = {
  housing: 'home',
  'language-courses': 'translate',
  'job-insertion': 'briefcase',
  'legal-aid': 'scale',
  health: 'heart-pulse',
  training: 'graduation-cap',
  'leisure-culture': 'ticket',
  documentation: 'document',
};
const defaultCategoryIcon: IconName = 'grid';

interface ServiceCategoryRowProps {
  readonly id: string;
  readonly slug: string;
  readonly color: string;
  readonly title: string;
  readonly languageFontClass: string;
  readonly onSelect: (id: string) => void;
}

/**
 * One category as a tile of the card Inici uses for Formularis i enquestes
 * (RAPP-854): its icon in a circle of the category's own colour (RAPP-856),
 * the divider and its name.
 */
const ServiceCategoryRow = memo(function ServiceCategoryRow({
  id,
  slug,
  color,
  title,
  languageFontClass,
  onSelect,
}: ServiceCategoryRowProps) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <View className="basis-[46%] grow">
      <RaisedIconCard
        testID={`service-category-${slug}`}
        icon={categoryIcons[slug] ?? defaultCategoryIcon}
        iconWash={serviceCategoryWash(color)}
        title={title}
        accessibilityLabel={title}
        languageFontClass={languageFontClass}
        onOpen={handlePress}
        tile
      />
    </View>
  );
});

/** The Ajuda service categories, two tiles to a row. */
export function ServiceCategoryGrid({
  categories,
  onSelect,
}: {
  readonly categories: readonly AdminServiceCategory[];
  readonly onSelect: (id: string) => void;
}) {
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="flex-row flex-wrap gap-md">
      {categories.map((category) => {
        const title = resolveLocalizedText(category.name, language);
        if (title === undefined) return null;
        return (
          <ServiceCategoryRow
            key={category.id}
            id={category.id}
            slug={category.slug}
            color={category.color}
            title={title.text}
            languageFontClass={languageFontClass}
            onSelect={onSelect}
          />
        );
      })}
    </View>
  );
}
