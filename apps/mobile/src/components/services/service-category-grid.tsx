import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { AdminServiceCategory } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

const categorySymbols: Readonly<Record<string, SymbolViewProps['name']>> = {
  housing: { ios: 'house.fill', android: 'home', web: 'home' },
  'language-courses': { ios: 'character.book.closed.fill', android: 'translate', web: 'translate' },
  'job-insertion': { ios: 'briefcase.fill', android: 'work', web: 'work' },
  'legal-aid': { ios: 'scale.3d', android: 'gavel', web: 'gavel' },
  health: { ios: 'heart.text.square.fill', android: 'medical_services', web: 'medical_services' },
  training: { ios: 'graduationcap.fill', android: 'school', web: 'school' },
  'leisure-culture': {
    ios: 'ticket.fill',
    android: 'confirmation_number',
    web: 'confirmation_number',
  },
  documentation: { ios: 'doc.text.fill', android: 'description', web: 'description' },
};
const defaultCategorySymbol: SymbolViewProps['name'] = {
  ios: 'square.grid.2x2.fill',
  android: 'category',
  web: 'category',
};

interface ServiceCategoryCardProps {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly onSelect: (id: string) => void;
}

export const ServiceCategoryCard = memo(function ServiceCategoryCard({
  id,
  slug,
  title,
  onSelect,
}: ServiceCategoryCardProps) {
  const languageFontClass = useLanguageFontClass();
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
        <View className="h-xl w-xl items-center justify-center rounded-full bg-primary-light">
          <SymbolView
            accessible={false}
            name={categorySymbols[slug] ?? defaultCategorySymbol}
            size={tokens.fontSize.xl}
            tintColor={tokens.colors.primary.dark}
          />
        </View>
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
