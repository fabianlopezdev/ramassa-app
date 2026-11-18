import type { IconName } from '@/components/icons/icon';
import { CategoryTileGrid, type CategoryTile } from '@/components/layout/category-tile-grid';
import { useMemo } from 'react';
import { categoryWash } from '@ramassa/shared/category-colors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { type AdminServiceCategory } from '@ramassa/shared/services';

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

/** The Ajuda service categories as the shared category tiles (RAPP-870). */
export function ServiceCategoryGrid({
  categories,
  onSelect,
}: {
  readonly categories: readonly AdminServiceCategory[];
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
                testID: `service-category-${category.slug}`,
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
