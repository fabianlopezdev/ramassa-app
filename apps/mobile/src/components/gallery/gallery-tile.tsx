import { Badge } from '@/components/layout/badge';
import { PressableScale } from '@/components/motion/pressable-scale';
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
 * The word on a photo new to her (RAPP-873), at its top start corner, the way
 * the team's gallery marks a video over its photo. It is not read out and
 * takes no touch: the tile's own label carries the word. Its own component,
 * so a tile without the word looks up no font.
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
      <Badge label={label} tone="overlay" languageFontClass={languageFontClass} />
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
      <PressableScale
        testID={`gallery-item-${id}`}
        accessibilityLabel={accessibilityLabel}
        onPress={open}
        haptic="tapLight"
        style={continuousCorners}
        className="overflow-hidden rounded-md bg-neutral-200"
      >
        {source === null ? null : (
          <Image
            recyclingKey={id}
            source={source}
            accessibilityLabel={imageAlt}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={motionTokens.duration.fast}
            style={styles.tile}
          />
        )}
        {unseenLabel === null ? null : <GalleryTileUnseenMark label={unseenLabel} />}
      </PressableScale>
    </View>
  );
});
