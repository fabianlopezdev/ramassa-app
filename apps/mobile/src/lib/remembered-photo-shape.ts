/**
 * The shape of a photo, remembered once it has loaded (RAPP-915).
 *
 * The photo at the top of a detail screen shows the picture at its own shape.
 * Media rows store no dimensions, so the shape is only known after the first
 * load. It is kept here by the photo's stored key, so the screen opened again
 * starts at the right size and the photo does not jump when it arrives. Card
 * photos have one fixed shape (RAPP-921); they measure only to choose their
 * default crop (RAPP-932): the top third of a tall photo, the middle of a wide
 * one.
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
  /** Width over height once the photo has loaded here or anywhere before; null until then. */
  readonly loadedAspectRatio: number | null;
  /** For the image's `onLoad`. */
  readonly rememberShape: (event: ImageLoadEventData) => void;
} {
  const [measured, setMeasured] = useState<MeasuredShape | null>(null);
  // A recycled list cell keeps its state from the photo it showed before, so
  // the shape only counts while it belongs to this photo.
  const loadedAspectRatio =
    measured?.photoKey === photoKey
      ? measured.aspectRatio
      : (loadedAspectRatios.get(photoKey) ?? null);
  const aspectRatio = loadedAspectRatio ?? PHOTO_PLACEHOLDER_ASPECT_RATIO;
  const rememberShape = useCallback(
    ({ source: loaded }: ImageLoadEventData) => {
      if (loaded.width <= 0 || loaded.height <= 0) return;
      const loadedAspectRatio = loaded.width / loaded.height;
      loadedAspectRatios.set(photoKey, loadedAspectRatio);
      setMeasured({ photoKey, aspectRatio: loadedAspectRatio });
    },
    [photoKey],
  );
  return { aspectRatio, loadedAspectRatio, rememberShape };
}
