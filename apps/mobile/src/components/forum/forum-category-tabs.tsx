import { FilterChips } from '@/components/layout/filter-chips';
import { raisedToneFromColorName } from '@/components/layout/raised-surface';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useMemo } from 'react';
import { Text } from 'react-native';
import type { ForumCategoryRow } from '@ramassa/shared/forum';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';

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

const ALL_CATEGORIES = 'all';

/**
 * The forum categories on Comunitat as the shared filter chips (RAPP-852),
 * the same pills as Avisos on Inici, each tinted by its category's colour.
 */
export const ForumCategoryFilters = memo(function ForumCategoryFilters({
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
  const languageFontClass = useLanguageFontClass();
  const options = useMemo(
    () => [
      { id: ALL_CATEGORIES, label: allLabel, testID: 'forum-category-all' },
      ...categories.map((category) => ({
        id: category.id,
        label: resolveLocalizedText(category.name, language)?.text ?? category.slug,
        tone: raisedToneFromColorName(category.color),
        testID: `forum-category-${category.id}`,
      })),
    ],
    [allLabel, categories, language],
  );
  const select = useCallback(
    (id: string) => onSelect(id === ALL_CATEGORIES ? null : id),
    [onSelect],
  );
  return (
    <FilterChips
      options={options}
      selected={selectedId ?? ALL_CATEGORIES}
      accessibilityLabel={accessibilityLabel}
      languageFontClass={languageFontClass}
      onSelect={select}
    />
  );
});
