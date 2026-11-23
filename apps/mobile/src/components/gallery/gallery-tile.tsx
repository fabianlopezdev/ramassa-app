import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Badge } from '@/components/layout/badge';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { motionTokens } from '@ramassa/shared/tokens/motion';

const GALLERY_TILE_ASPECT_RATIO = 1;
const styles = StyleSheet.create({
  tile: { width: '100%', aspectRatio: GALLERY_TILE_ASPECT_RATIO },
  title: { writingDirection: 'auto' },
});
const TILE_TITLE_MAX_LINES = 2;
const TILE_TITLE_CLASS = 'text-start text-md font-semibold text-neutral-900';
const TILE_DATE_CLASS = 'text-start text-sm text-neutral-600';
// Never seen: two lines of title and one of date, at her text size and in her
// language's font, give every tile the same height, so a row stays even.
const TILE_TITLE_ROOM = 'M\nM';
const TILE_DATE_ROOM = 'M';

/**
 * The title and the date under a gallery photo (RAPP-913). A title takes at
 * most two lines; without one, only the date shows. The text sits at the top
 * of a block that always has room for both, so every tile in a row matches.
 */
function GalleryTileCaption({
  title,
  date,
  fontClass,
}: {
  readonly title: string | null;
  readonly date: string;
  readonly fontClass: string;
}) {
  return (
    <View className="p-sm">
      <View aria-hidden pointerEvents="none" className="opacity-0">
        <Text className={`${TILE_TITLE_CLASS} ${fontClass}`}>{TILE_TITLE_ROOM}</Text>
        <Text className={`${TILE_DATE_CLASS} ${fontClass}`}>{TILE_DATE_ROOM}</Text>
      </View>
      <View className="absolute end-sm start-sm top-sm">
        {title === null ? null : (
          <Text
            testID="gallery-tile-title"
            numberOfLines={TILE_TITLE_MAX_LINES}
            style={styles.title}
            className={`${TILE_TITLE_CLASS} ${fontClass}`}
          >
            {title}
          </Text>
        )}
        <Text
          testID="gallery-tile-date"
          numberOfLines={1}
          className={`${TILE_DATE_CLASS} ${fontClass}`}
        >
          {date}
        </Text>
      </View>
    </View>
  );
}

/**
 * The word on a photo new to her (RAPP-873), at its top start corner, where
 * the team's gallery places its mark over a photo, in the colour every "Nou"
 * has. It is not read out and takes no touch: the tile's own label carries
 * the word. Its own component, so a tile without the word looks up no font.
 */
function GalleryTileUnseenMark({ label }: { readonly label: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="absolute start-xs top-xs"
    >
      <Badge label={label} tone="brand" languageFontClass={languageFontClass} />
    </View>
  );
}

export const GalleryTile = memo(function GalleryTile({
  id,
  objectKeyOrUrl,
  accessToken,
  accessibilityLabel,
  imageAlt,
  title,
  date,
  fontClass,
  onOpen,
  unseenLabel = null,
}: {
  readonly id: string;
  readonly objectKeyOrUrl: string;
  readonly accessToken: string | undefined;
  readonly accessibilityLabel: string;
  readonly imageAlt: string;
  /** The item's title; null when it has none. */
  readonly title: string | null;
  /** When it was shared, already written in her language. */
  readonly date: string;
  readonly fontClass: string;
  readonly onOpen: (id: string) => void;
  /** Set while the photo is new to her: the word over its top start corner. */
  readonly unseenLabel?: string | null;
}) {
  const source = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, objectKeyOrUrl],
  );
  const open = useCallback(() => onOpen(id), [id, onOpen]);

  return (
    <View className="p-xs">
      <SelectionChoiceSurface
        testID={`gallery-item-${id}`}
        label={accessibilityLabel}
        accessibilityRole="link"
        onPress={open}
        paddingClassName=""
        contentClassName=""
        rowStyle={continuousCorners}
      >
        {/* Grey while the photo loads, or when it has no source. */}
        <View className="bg-neutral-200" style={styles.tile}>
          {source === null ? null : (
            <Image
              recyclingKey={id}
              source={source}
              accessibilityLabel={imageAlt}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={motionTokens.duration.fast}
              style={StyleSheet.absoluteFill}
            />
          )}
          {unseenLabel === null ? null : <GalleryTileUnseenMark label={unseenLabel} />}
        </View>
        <GalleryTileCaption title={title} date={date} fontClass={fontClass} />
      </SelectionChoiceSurface>
    </View>
  );
});
