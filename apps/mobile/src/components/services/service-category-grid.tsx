import type { IconName } from '@/components/icons/icon';
import { IconDisc } from '@/components/icons/icon-disc';
import { RaisedPressable } from '@/components/layout/raised-surface';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { serviceCategoryWash, type AdminServiceCategory } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

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

interface ServiceCategoryCardProps {
  readonly id: string;
  readonly slug: string;
  readonly color: string;
  readonly title: string;
  readonly onSelect: (id: string) => void;
}

const ServiceCategoryCard = memo(function ServiceCategoryCard({
  id,
  slug,
  color,
  title,
  onSelect,
}: ServiceCategoryCardProps) {
  const languageFontClass = useLanguageFontClass();
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  // The app's raised surface (RAPP-854): border, edge and press come from
  // raised-surface, so the tiles follow every change to it. Cards in one row
  // share a height because the cell and the face both fill.
  return (
    <View className="basis-[46%] grow">
      <RaisedPressable
        testID={`service-category-${slug}`}
        accessibilityLabel={title}
        onPress={handlePress}
        className="flex-1"
        faceClassName="flex-1 flex-row items-center gap-sm px-sm py-md"
      >
        <IconDisc
          name={categoryIcons[slug] ?? defaultCategoryIcon}
          wash={serviceCategoryWash(color)}
          size={tokens.fontSize.xl}
        />
        <Text
          className={`flex-1 text-start text-md font-bold text-neutral-900 ${languageFontClass}`}
        >
          {title}
        </Text>
      </RaisedPressable>
    </View>
  );
});

export function ServiceCategoryGrid({
  categories,
  onSelect,
}: {
  readonly categories: readonly AdminServiceCategory[];
  readonly onSelect: (id: string) => void;
}) {
  const { language } = useLanguage();
  return (
    <View className="flex-row flex-wrap gap-md">
      {categories.map((category) => {
        const title = resolveLocalizedText(category.name, language);
        if (title === undefined) return null;
        return (
          <ServiceCategoryCard
            key={category.id}
            id={category.id}
            slug={category.slug}
            color={category.color}
            title={title.text}
            onSelect={onSelect}
          />
        );
      })}
    </View>
  );
}
