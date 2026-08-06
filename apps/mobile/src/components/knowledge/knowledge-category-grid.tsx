import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { KnowledgeCategoryRow } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

export type PlayerKnowledgeFilter = 'all' | 'stories' | string;

const allSymbol: SymbolViewProps['name'] = {
  ios: 'rectangle.grid.2x2.fill',
  android: 'apps',
  web: 'apps',
};
const storiesSymbol: SymbolViewProps['name'] = {
  ios: 'person.2.fill',
  android: 'groups',
  web: 'groups',
};

function categorySymbol(slug: string): SymbolViewProps['name'] {
  if (slug === 'rights-asylum') return { ios: 'scale.3d', android: 'gavel', web: 'gavel' };
  if (slug === 'digital-skills' || slug === 'digital-literacy') {
    return { ios: 'iphone', android: 'smartphone', web: 'smartphone' };
  }
  if (slug === 'gender-based-violence' || slug === 'gender-equality') {
    return {
      ios: 'shield.lefthalf.filled',
      android: 'health_and_safety',
      web: 'health_and_safety',
    };
  }
  return { ios: 'book.closed.fill', android: 'auto_stories', web: 'auto_stories' };
}

interface CategoryCardProps {
  readonly id: PlayerKnowledgeFilter;
  readonly title: string;
  readonly hint: string;
  readonly symbol: SymbolViewProps['name'];
  readonly selected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (filter: PlayerKnowledgeFilter) => void;
}

function CategoryCard({
  id,
  title,
  hint,
  symbol,
  selected,
  languageFontClass,
  onSelect,
}: CategoryCardProps) {
  return (
    <View className="basis-[48%] grow">
      <PressableScale
        testID={`knowledge-filter-${id}`}
        accessibilityLabel={`${title}. ${hint}`}
        onPress={() => onSelect(id)}
        haptic="selection"
        isSelected={selected}
        style={continuousCorners}
        className={`min-h-recommended gap-xs rounded-lg border p-md ${
          selected ? 'border-primary bg-primary/10' : 'border-neutral-200 bg-neutral-50'
        }`}
      >
        <SymbolView
          name={symbol}
          size={tokens.fontSize['2xl']}
          tintColor={selected ? tokens.colors.primary.dark : tokens.colors.neutral[600]}
        />
        <Text className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}>
          {title}
        </Text>
        <Text className={`text-start text-xs text-neutral-600 ${languageFontClass}`}>{hint}</Text>
      </PressableScale>
    </View>
  );
}

export function KnowledgeCategoryGrid({
  categories,
  selected,
  onSelect,
  counts,
}: {
  readonly categories: readonly KnowledgeCategoryRow[];
  readonly selected: PlayerKnowledgeFilter;
  readonly onSelect: (filter: PlayerKnowledgeFilter) => void;
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
      <View className="flex-row flex-wrap gap-sm">
        <CategoryCard
          id="all"
          title={t('knowledge:allResources')}
          hint={`${t('knowledge:allResourcesHint')}. ${t('knowledge:resourcesCount', { count: counts.all ?? 0 })}`}
          symbol={allSymbol}
          selected={selected === 'all'}
          languageFontClass={languageFontClass}
          onSelect={onSelect}
        />
        <CategoryCard
          id="stories"
          title={t('knowledge:participantStories')}
          hint={`${t('knowledge:participantStoriesHint')}. ${t('knowledge:resourcesCount', { count: counts.stories ?? 0 })}`}
          symbol={storiesSymbol}
          selected={selected === 'stories'}
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
              hint={t('knowledge:resourcesCount', { count: counts[category.id] ?? 0 })}
              symbol={categorySymbol(category.slug)}
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
