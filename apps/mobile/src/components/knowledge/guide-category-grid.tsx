/**
 * The guide categories of Ajuda › Guies as the shared category tiles
 * (RAPP-870), the same tiles as Serveis, each with its own colour (RAPP-868).
 */
import type { IconName } from '@/components/icons/icon';
import { CategoryTileGrid, type CategoryTile } from '@/components/layout/category-tile-grid';
import { useMemo } from 'react';
import { categoryWash } from '@ramassa/shared/category-colors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { KnowledgeCategoryRow } from '@ramassa/shared/knowledge';

const categoryIcons: Readonly<Record<string, IconName>> = {
  'rights-asylum': 'scale',
  'digital-literacy': 'smartphone',
  'digital-skills': 'smartphone',
  'gender-equality': 'shield',
  'gender-based-violence': 'shield',
};
const defaultCategoryIcon: IconName = 'book';

export function GuideCategoryGrid({
  categories,
  onSelect,
}: {
  readonly categories: readonly KnowledgeCategoryRow[];
  readonly onSelect: (id: string) => void;
}) {
  const { language } = useLanguage();
  const tiles = useMemo(
    () =>
      categories.flatMap((category): CategoryTile[] => {
        const title = resolveLocalizedText(category.name, language);
        return title === undefined
          ? []
          : [
              {
                id: category.id,
                testID: `guide-category-${category.slug}`,
                icon: categoryIcons[category.slug] ?? defaultCategoryIcon,
                wash: categoryWash(category.color),
                title: title.text,
              },
            ];
      }),
    [categories, language],
  );
  return <CategoryTileGrid tiles={tiles} onSelect={onSelect} />;
}
