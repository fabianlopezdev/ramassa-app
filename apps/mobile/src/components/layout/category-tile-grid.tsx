/**
 * The categories of an Ajuda section as tiles, two to a row (RAPP-854,
 * RAPP-870): each a tile of the shared raised icon card, with its icon in a
 * circle of the category's own colour (RAPP-856, RAPP-868), the divider and
 * its name. Serveis and Guies both draw their categories with it, so a change
 * here reaches both. Tiles go in pairs, so a lone tile or the last of an odd
 * number keeps half the width, like every other tile; a long name steps down
 * a size before a word would break (see `WholeWordsText`).
 */
import type { IconName } from '@/components/icons/icon';
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
}

const TILES_PER_ROW = 2;

const CategoryTileView = memo(function CategoryTileView({
  tile,
  languageFontClass,
  onSelect,
}: {
  readonly tile: CategoryTile;
  readonly languageFontClass: string;
  readonly onSelect: (id: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(tile.id), [onSelect, tile.id]);
  return (
    <View className="flex-1">
      <RaisedIconCard
        testID={tile.testID}
        icon={tile.icon}
        iconWash={tile.wash}
        title={tile.title}
        accessibilityLabel={tile.title}
        languageFontClass={languageFontClass}
        onOpen={handlePress}
        tile
      />
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
