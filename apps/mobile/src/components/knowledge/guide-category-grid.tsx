/**
 * The guide categories of Ajuda › Guies as the shared category tiles
 * (RAPP-870), the same tiles as Serveis, each with its own colour (RAPP-868).
 */
import type { IconName } from '@/components/icons/icon';
import { CategoryTileGrid, type CategoryTile } from '@/components/layout/category-tile-grid';
import { formatUnreadBadge } from '@/lib/unread-badge';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  newCounts,
  onSelect,
}: {
  readonly categories: readonly KnowledgeCategoryRow[];
  /** New items she has not opened, by category id (RAPP-873). */
  readonly newCounts: Readonly<Record<string, number>>;
  readonly onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('common');
  const { language } = useLanguage();
  const tiles = useMemo(
    () =>
      categories.flatMap((category): CategoryTile[] => {
        const title = resolveLocalizedText(category.name, language);
        const newCount = newCounts[category.id] ?? 0;
        return title === undefined
          ? []
          : [
              {
                id: category.id,
                testID: `guide-category-${category.slug}`,
                icon: categoryIcons[category.slug] ?? defaultCategoryIcon,
                wash: categoryWash(category.color),
                title: title.text,
                count: formatUnreadBadge(newCount),
                accessibilityLabel:
                  newCount > 0 ? t('newCount', { label: title.text, count: newCount }) : undefined,
              },
            ];
      }),
    [categories, language, newCounts, t],
  );
  return <CategoryTileGrid tiles={tiles} onSelect={onSelect} />;
}
