import { Icon, type IconName } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import type { PlayerGuideFilter } from '@/lib/player-guides';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { KnowledgeCategoryRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

function categoryIcon(slug: string): IconName {
  if (slug === 'rights-asylum') return 'scale';
  if (slug === 'digital-skills' || slug === 'digital-literacy') return 'smartphone';
  if (slug === 'gender-based-violence' || slug === 'gender-equality') return 'shield';
  return 'book';
}

interface CategoryCardProps {
  readonly id: PlayerGuideFilter;
  readonly title: string;
  readonly hint: string;
  readonly symbol: IconName;
  readonly selected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (filter: PlayerGuideFilter) => void;
}

const CategoryCard = memo(function CategoryCard({
  id,
  title,
  hint,
  symbol,
  selected,
  languageFontClass,
  onSelect,
}: CategoryCardProps) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <View className="basis-[48%] grow">
      <PressableScale
        testID={`knowledge-filter-${id}`}
        accessibilityRole="radio"
        accessibilityLabel={`${title}. ${hint}`}
        onPress={handlePress}
        haptic="selection"
        isSelected={selected}
        style={continuousCorners}
        className={`min-h-recommended gap-xs rounded-lg border p-md ${
          selected ? 'border-primary bg-primary/10' : 'border-neutral-200 bg-neutral-50'
        }`}
      >
        <Icon
          name={symbol}
          weight={selected ? 'boldDuotone' : 'linear'}
          size={tokens.fontSize['2xl']}
          color={selected ? tokens.colors.primary.dark : tokens.colors.neutral[600]}
        />
        <Text className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}>
          {title}
        </Text>
        <Text className={`text-start text-xs tabular-nums text-neutral-600 ${languageFontClass}`}>
          {hint}
        </Text>
      </PressableScale>
    </View>
  );
});

export function KnowledgeCategoryGrid({
  categories,
  selected,
  onSelect,
  counts,
}: {
  readonly categories: readonly KnowledgeCategoryRow[];
  readonly selected: PlayerGuideFilter;
  readonly onSelect: (filter: PlayerGuideFilter) => void;
  readonly counts: Readonly<Record<string, number>>;
}) {
  const { t } = useTranslation('knowledge');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
      >
        {t('knowledge:categoriesHeading')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('knowledge:categoriesHeading')}
        className="flex-row flex-wrap gap-sm"
      >
        <CategoryCard
          id="all"
          title={t('knowledge:guidesAll')}
          hint={t('guidesCount', { count: counts.all ?? 0 })}
          symbol="grid"
          selected={selected === 'all'}
          languageFontClass={languageFontClass}
          onSelect={onSelect}
        />
        {categories.map((category) => {
          const title = resolveLocalizedText(category.name, language);
          if (title === undefined) return null;
          return (
            <CategoryCard
              key={category.id}
              id={category.id}
              title={title.text}
              hint={t('guidesCount', { count: counts[category.id] ?? 0 })}
              symbol={categoryIcon(category.slug)}
              selected={selected === category.id}
              languageFontClass={languageFontClass}
              onSelect={onSelect}
            />
          );
        })}
      </View>
    </View>
  );
}
