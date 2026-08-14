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

export const ForumCategoryOption = memo(function ForumCategoryOption({
  id,
  label,
  selected,
  onSelect,
  testID,
  accessibilityRole,
  isDisabled = false,
}: {
  readonly id: string | null;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly testID: string;
  readonly accessibilityRole: 'radio' | 'tab';
  readonly isDisabled?: boolean;
}) {
  const languageFontClass = useLanguageFontClass();
  const select = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole={accessibilityRole}
      onPress={select}
      haptic="selection"
      isSelected={selected}
      isDisabled={isDisabled}
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

export const ForumCategoryTabs = memo(function ForumCategoryTabs({
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
  const renderCategory = useCallback(
    (category: ForumCategoryRow) => {
      const label = resolveLocalizedText(category.name, language)?.text ?? category.slug;
      return (
        <ForumCategoryOption
          key={category.id}
          id={category.id}
          label={label}
          selected={selectedId === category.id}
          onSelect={onSelect}
          testID={`forum-category-${category.id}`}
          accessibilityRole="tab"
        />
      );
    },
    [language, onSelect, selectedId],
  );
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <ForumCategoryOption
          id={null}
          label={allLabel}
          selected={selectedId === null}
          onSelect={onSelect}
          testID="forum-category-all"
          accessibilityRole="tab"
        />
        {categories.map(renderCategory)}
      </ScrollView>
    </View>
  );
});
