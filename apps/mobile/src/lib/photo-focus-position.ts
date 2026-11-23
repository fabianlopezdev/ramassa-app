/**
 * Where a cropped photo sits in its frame (RAPP-932): the focus its uploader
 * chose, or the default for its shape, as expo-image `contentPosition`.
 *
 * The default needs the photo's shape: the top third of a tall photo, the
 * middle of a wide one. The shape is remembered by the photo's key once it
 * has loaded anywhere (`remembered-photo-shape`); until then the top third.
 */
import { useRememberedPhotoShape } from '@/lib/remembered-photo-shape';
import type { ImageContentPosition, ImageLoadEventData } from 'expo-image';
import { useMemo } from 'react';
import {
  photoFocusPercentages,
  resolvePhotoFocus,
  type PhotoFocus,
} from '@ramassa/shared/photo-focus';

export function usePhotoFocusPosition(
  photoKey: string,
  focus: PhotoFocus | null,
): {
  readonly contentPosition: ImageContentPosition;
  /** Width over height: the loaded shape, or a placeholder until it is known. */
  readonly aspectRatio: number;
  /** For the image's `onLoad`, so a photo without a chosen focus learns its shape. */
  readonly rememberShape: (event: ImageLoadEventData) => void;
} {
  const { aspectRatio, loadedAspectRatio, rememberShape } = useRememberedPhotoShape(photoKey);
  const contentPosition = useMemo<ImageContentPosition>(
    () => photoFocusPercentages(resolvePhotoFocus(focus, loadedAspectRatio)),
    [focus, loadedAspectRatio],
  );
  return { contentPosition, aspectRatio, rememberShape };
}
