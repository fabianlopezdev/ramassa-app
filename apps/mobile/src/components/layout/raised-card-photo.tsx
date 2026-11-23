/**
 * The photo across the top of a raised card, for its `media` slot. Every card
 * with a photo shows it through this piece: a forum post and an avís
 * (RAPP-911), a guide, a story and a service (RAPP-915), so they all show
 * their photo the same way and reuse the same cached image as a list scrolls.
 *
 * The photo keeps its own shape (RAPP-914): it spans the card's width at its
 * own aspect ratio, uncropped. A tall portrait photo stops at a maximum height
 * and fits inside it, so one card never fills the screen. Until the photo has
 * loaded once, the card holds a common camera shape; after that its shape is
 * remembered, so a card scrolled back into view opens at its real size.
 *
 * On a card that opens through an `href`, the photo is the source of the zoom
 * that grows it into the photo of the opened screen (RAPP-916).
 */
import { PhotoZoomSource } from '@/components/media/photo-zoom';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useRememberedPhotoShape } from '@/lib/remembered-photo-shape';
import { mobileClientEnv } from '@/lib/supabase';
import { Image, type ImageSource } from 'expo-image';
import { memo, useMemo } from 'react';
import type { ImageStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const RAISED_CARD_PHOTO_MAX_HEIGHT = tokens.spacing['3xl'] * 6;

const photoStyle: ImageStyle = {
  width: '100%',
  maxHeight: RAISED_CARD_PHOTO_MAX_HEIGHT,
  alignSelf: 'center',
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
  const { aspectRatio, rememberShape } = useRememberedPhotoShape(recyclingKey);
  // One flat style object: the zoom source refuses a style array (RAPP-916).
  const shapeStyle = useMemo<ImageStyle>(() => ({ ...photoStyle, aspectRatio }), [aspectRatio]);
  return (
    <PhotoZoomSource>
      <Image
        source={source}
        accessibilityLabel={accessibilityLabel}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey}
        onLoad={rememberShape}
        style={shapeStyle}
      />
    </PhotoZoomSource>
  );
});
