/**
 * The shape of a photo, remembered once it has loaded (RAPP-914, RAPP-915).
 *
 * A card photo and the photo at the top of the screen it opens show the same
 * picture at its own shape. Media rows store no dimensions, so the shape is
 * only known after the first load. It is kept here by the photo's stored key:
 * a card scrolled back into view opens at its real size, and the screen a
 * card opens starts at the shape the card already measured, so the photo
 * does not jump when it arrives.
 */
import type { ImageLoadEventData } from 'expo-image';
import { useCallback, useState } from 'react';

/** A common camera shape, held until the photo has loaded once. */
const PHOTO_PLACEHOLDER_ASPECT_RATIO = 4 / 3;

/** Each photo's width over height once it has loaded, by its stored key. */
const loadedAspectRatios = new Map<string, number>();

interface MeasuredShape {
  readonly photoKey: string;
  readonly aspectRatio: number;
}

export function useRememberedPhotoShape(photoKey: string): {
  /** Width over height: the loaded shape, or the placeholder until it is known. */
  readonly aspectRatio: number;
  /** For the image's `onLoad`. */
  readonly rememberShape: (event: ImageLoadEventData) => void;
} {
  const [measured, setMeasured] = useState<MeasuredShape | null>(null);
  // A recycled list cell keeps its state from the photo it showed before, so
  // the shape only counts while it belongs to this photo.
  const aspectRatio =
    measured?.photoKey === photoKey
      ? measured.aspectRatio
      : (loadedAspectRatios.get(photoKey) ?? PHOTO_PLACEHOLDER_ASPECT_RATIO);
  const rememberShape = useCallback(
    ({ source: loaded }: ImageLoadEventData) => {
      if (loaded.width <= 0 || loaded.height <= 0) return;
      const loadedAspectRatio = loaded.width / loaded.height;
      loadedAspectRatios.set(photoKey, loadedAspectRatio);
      setMeasured({ photoKey, aspectRatio: loadedAspectRatio });
    },
    [photoKey],
  );
  return { aspectRatio, rememberShape };
}
