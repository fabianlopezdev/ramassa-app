import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ForumCategoryRow } from '@ramassa/shared/forum';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
});

const CategoryButton = memo(function CategoryButton({
  id,
  label,
  selected,
  onSelect,
}: {
  readonly id: string | null;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (id: string | null) => void;
}) {
  const languageFontClass = useLanguageFontClass();
  const select = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <PressableScale
      testID={`forum-category-${id ?? 'all'}`}
      accessibilityLabel={label}
      accessibilityRole="tab"
      onPress={select}
      haptic="selection"
      isSelected={selected}
      style={continuousCorners}
      className={`min-h-recommended justify-center rounded-full border px-lg ${
        selected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
      }`}
    >
      <Text
        className={`text-md font-semibold ${selected ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
});

export function ForumCategoryTabs({
  categories,
  selectedId,
  allLabel,
  accessibilityLabel,
  onSelect,
}: {
  readonly categories: readonly ForumCategoryRow[];
  readonly selectedId: string | null;
  readonly allLabel: string;
  readonly accessibilityLabel: string;
  readonly onSelect: (id: string | null) => void;
}) {
  const { language } = useLanguage();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
      >
        <CategoryButton
          id={null}
          label={allLabel}
          selected={selectedId === null}
          onSelect={onSelect}
        />
        {categories.map((category) => {
          const label = resolveLocalizedText(category.name, language)?.text ?? category.slug;
          return (
            <CategoryButton
              key={category.id}
              id={category.id}
              label={label}
              selected={selectedId === category.id}
              onSelect={onSelect}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
