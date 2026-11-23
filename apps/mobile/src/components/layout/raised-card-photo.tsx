/**
 * The photo across the top of a raised card, for its `media` slot. Every card
 * with a photo shows it through this piece: a forum post and an avís
 * (RAPP-911), a guide, a story and a service (RAPP-915), so they all show
 * their photo the same way and reuse the same cached image as a list scrolls.
 *
 * Every card photo has one landscape shape (RAPP-921), filled and cropped, so
 * a tall photo never makes a tall card and the cards of a list line up. The
 * whole photo is on the screen the card opens.
 *
 * On a card that opens through an `href`, the photo is the source of the zoom
 * that grows it into the photo of the opened screen (RAPP-916), on Android too
 * (RAPP-920). Its stored key is the key the opened screen shows it under.
 */
import { PhotoZoomSource } from '@/components/media/photo-zoom';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image, type ImageSource } from 'expo-image';
import { memo, useMemo } from 'react';
import type { ImageStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// One flat style object: the zoom source refuses a style array (RAPP-916).
const photoStyle: ImageStyle = {
  width: '100%',
  aspectRatio: tokens.photoCard.aspectRatio,
};

/**
 * The stored key or link of a card's photo as an image source. Null when there
 * is no photo or it cannot be fetched yet, so the card leaves its slot empty.
 */
export function useRaisedCardPhotoSource(
  objectKeyOrUrl: string | null,
  accessToken: string | undefined,
): ImageSource | null {
  return useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, objectKeyOrUrl],
  );
}

export const RaisedCardPhoto = memo(function RaisedCardPhoto({
  source,
  recyclingKey,
  accessibilityLabel,
}: {
  readonly source: ImageSource;
  /** The photo's stored key, so a recycled list cell drops the last photo at once. */
  readonly recyclingKey: string;
  /** The photo's alt text. The card's own label is what a screen reader says. */
  readonly accessibilityLabel?: string;
}) {
  return (
    <PhotoZoomSource photoKey={recyclingKey}>
      <Image
        source={source}
        accessibilityLabel={accessibilityLabel}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey}
        style={photoStyle}
      />
    </PhotoZoomSource>
  );
});
