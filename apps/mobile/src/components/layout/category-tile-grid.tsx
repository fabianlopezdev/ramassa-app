/**
 * The categories of an Ajuda section as tiles, two to a row (RAPP-854,
 * RAPP-870): each a tile of the shared raised icon card, with its icon in a
 * circle of the category's own colour (RAPP-856, RAPP-868), the divider and
 * its name. Serveis and Guies both draw their categories with it, so a change
 * here reaches both. Tiles go in pairs, so a lone tile or the last of an odd
 * number keeps half the width, like every other tile. A tile whose name would
 * break inside a word stacks its icon over its name, and the other tile of its
 * row stretches to the same height (RAPP-879).
 *
 * A tile may carry a count on its top edge, in the circle cards use for one
 * (RAPP-873): what is new in that category. When any tile has one, every tile
 * keeps the room above it, so the tiles in a row stay level and share a
 * height.
 */
import type { IconName } from '@/components/icons/icon';
import { EdgeMarks } from '@/components/layout/edge-marks';
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useMemo } from 'react';
import { View } from 'react-native';

export interface CategoryTile {
  readonly id: string;
  readonly testID: string;
  readonly icon: IconName;
  /** The pale shade of the category's colour; without one the icon stands alone. */
  readonly wash: string | undefined;
  readonly title: string;
  /** A number on the tile's top edge, already formatted, such as its new items. */
  readonly count?: string | null;
  /** What is read out, when it says more than the title, such as the count. */
  readonly accessibilityLabel?: string;
}

const TILES_PER_ROW = 2;

const CategoryTileView = memo(function CategoryTileView({
  tile,
  hasMarks,
  languageFontClass,
  onSelect,
}: {
  readonly tile: CategoryTile;
  /** Some tile in the grid has a count, so this one keeps the room above too. */
  readonly hasMarks: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (id: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(tile.id), [onSelect, tile.id]);
  const count = tile.count ?? null;
  const card = (
    <RaisedIconCard
      testID={tile.testID}
      icon={tile.icon}
      iconWash={tile.wash}
      title={tile.title}
      accessibilityLabel={tile.accessibilityLabel ?? tile.title}
      count={count}
      languageFontClass={languageFontClass}
      onOpen={handlePress}
      tile
    />
  );
  return (
    <View className="flex-1">
      {/* A tile with a count brings its own marks; one without keeps the same room.
          The room grows from its own height like the tile does (RAPP-879). */}
      {hasMarks && count === null ? <EdgeMarks className="grow">{card}</EdgeMarks> : card}
    </View>
  );
});

export function CategoryTileGrid({
  tiles,
  onSelect,
}: {
  readonly tiles: readonly CategoryTile[];
  readonly onSelect: (id: string) => void;
}) {
  const languageFontClass = useLanguageFontClass();
  const hasMarks = tiles.some((tile) => tile.count !== undefined && tile.count !== null);
  const rows = useMemo(() => {
    const paired: (readonly CategoryTile[])[] = [];
    for (let start = 0; start < tiles.length; start += TILES_PER_ROW) {
      paired.push(tiles.slice(start, start + TILES_PER_ROW));
    }
    return paired;
  }, [tiles]);
  return (
    <View className="gap-md">
      {rows.map((row) => (
        <View key={row.map((tile) => tile.id).join('-')} className="flex-row gap-md">
          {row.map((tile) => (
            <CategoryTileView
              key={tile.id}
              tile={tile}
              hasMarks={hasMarks}
              languageFontClass={languageFontClass}
              onSelect={onSelect}
            />
          ))}
          {row.length < TILES_PER_ROW ? <View accessible={false} className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}
