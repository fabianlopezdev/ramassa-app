import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { Icon, type IconName } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { AdminServiceCategory } from '@ramassa/shared/services';
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
  readonly title: string;
  readonly onSelect: (id: string) => void;
}

const ServiceCategoryCard = memo(function ServiceCategoryCard({
  id,
  slug,
  title,
  onSelect,
}: ServiceCategoryCardProps) {
  const languageFontClass = useLanguageFontClass();
  const brandColor = useBrandColor();
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <View className="basis-[48%] grow">
      <PressableScale
        testID={`service-category-${slug}`}
        accessibilityLabel={title}
        onPress={handlePress}
        haptic="selection"
        style={continuousCorners}
        className="min-h-3xl items-start justify-between gap-md rounded-lg border border-neutral-200 bg-neutral-50 p-md"
      >
        {/* No circle behind it: the icon is the picture, in the brand colour like the cards on Inici. */}
        <Icon
          name={categoryIcons[slug] ?? defaultCategoryIcon}
          weight="boldDuotone"
          size={tokens.fontSize['3xl']}
          color={brandColor}
        />
        <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
          {title}
        </Text>
      </PressableScale>
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
    <View className="flex-row flex-wrap gap-sm">
      {categories.map((category) => {
        const title = resolveLocalizedText(category.name, language);
        if (title === undefined) return null;
        return (
          <ServiceCategoryCard
            key={category.id}
            id={category.id}
            slug={category.slug}
            title={title.text}
            onSelect={onSelect}
          />
        );
      })}
    </View>
  );
}
