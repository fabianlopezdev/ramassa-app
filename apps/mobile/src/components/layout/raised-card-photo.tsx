/**
 * The photo across the top of a raised card, for its `media` slot. A forum
 * post and an avís with a photo share it (RAPP-911), so both cards show their
 * photo the same way and reuse the same cached image as a list scrolls.
 */
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image, type ImageSource } from 'expo-image';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export const RAISED_CARD_PHOTO_HEIGHT = tokens.spacing['3xl'] * 3;

const styles = StyleSheet.create({
  photo: { width: '100%', height: RAISED_CARD_PHOTO_HEIGHT },
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
    <Image
      source={source}
      accessibilityLabel={accessibilityLabel}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      style={styles.photo}
    />
  );
});
