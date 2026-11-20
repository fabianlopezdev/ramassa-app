import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { motionTokens } from '@ramassa/shared/tokens/motion';

const GALLERY_TILE_ASPECT_RATIO = 1;
const styles = StyleSheet.create({
  tile: { width: '100%', aspectRatio: GALLERY_TILE_ASPECT_RATIO },
});

export const GalleryTile = memo(function GalleryTile({
  id,
  objectKeyOrUrl,
  accessToken,
  accessibilityLabel,
  imageAlt,
  onOpen,
}: {
  readonly id: string;
  readonly objectKeyOrUrl: string;
  readonly accessToken: string | undefined;
  readonly accessibilityLabel: string;
  readonly imageAlt: string;
  readonly onOpen: (id: string) => void;
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
        </View>
      </SelectionChoiceSurface>
    </View>
  );
});
