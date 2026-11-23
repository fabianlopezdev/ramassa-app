/**
 * The photo across the top of a raised card, for its `media` slot. A forum
 * post and an avís with a photo share it (RAPP-911), so both cards show their
 * photo the same way and reuse the same cached image as a list scrolls.
 *
 * The photo keeps its own shape (RAPP-914): it spans the card's width at its
 * own aspect ratio, uncropped. A tall portrait photo stops at a maximum height
 * and fits inside it, so one card never fills the screen. Until the photo has
 * loaded once, the card holds a common camera shape; after that its shape is
 * remembered, so a card scrolled back into view opens at its real size.
 */
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image, type ImageLoadEventData, type ImageSource } from 'expo-image';
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export const RAISED_CARD_PHOTO_MAX_HEIGHT = tokens.spacing['3xl'] * 6;
const PLACEHOLDER_ASPECT_RATIO = 4 / 3;

/** Each photo's width over height once it has loaded, by its recycling key. */
const loadedAspectRatios = new Map<string, number>();

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    maxHeight: RAISED_CARD_PHOTO_MAX_HEIGHT,
    alignSelf: 'center',
  },
});

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

interface MeasuredShape {
  readonly recyclingKey: string;
  readonly aspectRatio: number;
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
  const [measured, setMeasured] = useState<MeasuredShape | null>(null);
  // A recycled list cell keeps its state from the photo it showed before, so
  // the shape only counts while it belongs to this photo.
  const aspectRatio =
    measured?.recyclingKey === recyclingKey
      ? measured.aspectRatio
      : (loadedAspectRatios.get(recyclingKey) ?? PLACEHOLDER_ASPECT_RATIO);
  const shapeStyle = useMemo(() => [styles.photo, { aspectRatio }], [aspectRatio]);
  const rememberShape = useCallback(
    ({ source: loaded }: ImageLoadEventData) => {
      if (loaded.width <= 0 || loaded.height <= 0) return;
      const loadedAspectRatio = loaded.width / loaded.height;
      loadedAspectRatios.set(recyclingKey, loadedAspectRatio);
      setMeasured({ recyclingKey, aspectRatio: loadedAspectRatio });
    },
    [recyclingKey],
  );
  return (
    <Image
      source={source}
      accessibilityLabel={accessibilityLabel}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      onLoad={rememberShape}
      style={shapeStyle}
    />
  );
});
