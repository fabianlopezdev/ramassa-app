/**
 * The stock screen's item list (RAPP-800): every item the team has, with its
 * stock by size, so an item opens from Material at level 3. It joins the item
 * catalog with the stock levels; an item still in stock shows even when it is
 * switched off, and switched-off items without stock show only to the people
 * who edit items, after the active ones.
 */
import type { HandoverItemType, StockLevel } from '@ramassa/shared/equipment';

export type StockItemType = Pick<HandoverItemType, 'id' | 'key' | 'sizes' | 'is_active'>;

export interface StockItemRow {
  readonly itemKey: string;
  readonly label: string;
  /** The item's editor id, or null for stock whose item is not in the catalog. */
  readonly typeId: string | null;
  readonly isActive: boolean;
  readonly sizes: readonly StockLevel[];
}

export function stockItemRows({
  types,
  levels,
  label,
  locale,
  includeInactive,
}: {
  readonly types: readonly StockItemType[];
  readonly levels: readonly StockLevel[];
  readonly label: (key: string) => string;
  readonly locale: string;
  readonly includeInactive: boolean;
}): readonly StockItemRow[] {
  const typeByKey = new Map(types.map((type) => [type.key, type] as const));
  const levelsByKey = new Map<string, StockLevel[]>();
  for (const level of levels) {
    levelsByKey.set(level.itemKey, [...(levelsByKey.get(level.itemKey) ?? []), level]);
  }
  const keys = new Set<string>([...types.map((type) => type.key), ...levelsByKey.keys()]);
  // Sizes in the item's own order (XS, S, M, L), never alphabetical.
  const rank = (itemKey: string, size: string | null) => {
    const at = size === null ? -1 : (typeByKey.get(itemKey)?.sizes.indexOf(size) ?? -1);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...keys]
    .map((itemKey): StockItemRow => {
      const type = typeByKey.get(itemKey);
      return {
        itemKey,
        label: label(itemKey),
        typeId: type?.id ?? null,
        isActive: type?.is_active ?? true,
        sizes: [...(levelsByKey.get(itemKey) ?? [])].sort(
          (left, right) => rank(itemKey, left.size) - rank(itemKey, right.size),
        ),
      };
    })
    .filter((row) => row.isActive || includeInactive || row.sizes.length > 0)
    .sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.label.localeCompare(right.label, locale),
    );
}
