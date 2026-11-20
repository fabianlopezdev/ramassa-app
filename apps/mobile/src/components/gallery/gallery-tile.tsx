import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Badge } from '@/components/layout/badge';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { motionTokens } from '@ramassa/shared/tokens/motion';

const GALLERY_TILE_ASPECT_RATIO = 1;
const styles = StyleSheet.create({
  tile: { width: '100%', aspectRatio: GALLERY_TILE_ASPECT_RATIO },
});

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
  onOpen,
  unseenLabel = null,
}: {
  readonly id: string;
  readonly objectKeyOrUrl: string;
  readonly accessToken: string | undefined;
  readonly accessibilityLabel: string;
  readonly imageAlt: string;
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
      </SelectionChoiceSurface>
    </View>
  );
});
