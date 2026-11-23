/**
 * The shape of a photo, remembered once it has loaded (RAPP-915).
 *
 * The photo at the top of a detail screen shows the picture at its own shape.
 * Media rows store no dimensions, so the shape is only known after the first
 * load. It is kept here by the photo's stored key, so the screen opened again
 * starts at the right size and the photo does not jump when it arrives. Card
 * photos have one fixed shape (RAPP-921) and do not measure.
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
