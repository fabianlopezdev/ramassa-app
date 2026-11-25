/**
 * The zoom of a photo in the lightbox (RAPP-913).
 *
 * The photo is fitted inside the stage. Pinching or a double tap zooms it
 * around the point under the fingers, and a zoomed photo pans no further than
 * its own edges. At its fitted size a drag up or down closes the lightbox.
 *
 * Plain numbers in and out, marked as worklets, so the gestures run them on
 * the UI thread and the tests run them as they are.
 */

export const LIGHTBOX_MIN_SCALE = 1;
export const LIGHTBOX_MAX_SCALE = 4;
export const LIGHTBOX_DOUBLE_TAP_SCALE = 2.5;
/** A drag this share of the stage height closes the lightbox. */
const LIGHTBOX_DISMISS_DISTANCE_SHARE = 0.2;
/** A flick this fast, in points per second, also closes it. */
const LIGHTBOX_DISMISS_VELOCITY = 1000;
/** The backdrop is clear once the photo has been dragged this share of the stage height. */
const LIGHTBOX_BACKDROP_CLEAR_SHARE = 0.5;

export interface LightboxSize {
  readonly width: number;
  readonly height: number;
}

/** The photo's size at scale 1: as large as it fits whole inside the stage. */
export function fittedPhotoSize(
  stage: LightboxSize,
  photoAspectRatio: number | null,
): LightboxSize {
  'worklet';
  if (photoAspectRatio === null || stage.width <= 0 || stage.height <= 0) return stage;
  return photoAspectRatio > stage.width / stage.height
    ? { width: stage.width, height: stage.width / photoAspectRatio }
    : { width: stage.height * photoAspectRatio, height: stage.height };
}

export function clampLightboxScale(scale: number): number {
  'worklet';
  return Math.min(LIGHTBOX_MAX_SCALE, Math.max(LIGHTBOX_MIN_SCALE, scale));
}

/** How far the photo may move from the centre along one side before its edge comes in. */
export function lightboxPanLimit(stageLength: number, photoLength: number, scale: number): number {
  'worklet';
  return Math.max(0, (photoLength * scale - stageLength) / 2);
}

export function clampLightboxOffset(offset: number, limit: number): number {
  'worklet';
  return Math.min(limit, Math.max(-limit, offset));
}

/** The point of the unzoomed photo under the fingers, measured from the photo's centre. */
export function lightboxAnchor({
  focal,
  stageLength,
  offset,
  scale,
}: {
  readonly focal: number;
  readonly stageLength: number;
  readonly offset: number;
  readonly scale: number;
}): number {
  'worklet';
  return (focal - stageLength / 2 - offset) / scale;
}

/** The offset that keeps that point under the fingers at the new scale. */
export function lightboxOffsetKeepingAnchor({
  focal,
  stageLength,
  anchor,
  scale,
}: {
  readonly focal: number;
  readonly stageLength: number;
  readonly anchor: number;
  readonly scale: number;
}): number {
  'worklet';
  return focal - stageLength / 2 - anchor * scale;
}

/** A drag far enough, or a flick fast enough in the same direction, closes the lightbox. */
export function shouldDismissLightbox({
  translation,
  velocity,
  stageLength,
}: {
  readonly translation: number;
  readonly velocity: number;
  readonly stageLength: number;
}): boolean {
  'worklet';
  if (Math.abs(translation) > stageLength * LIGHTBOX_DISMISS_DISTANCE_SHARE) return true;
  return (
    Math.abs(velocity) > LIGHTBOX_DISMISS_VELOCITY && Math.sign(velocity) === Math.sign(translation)
  );
}

/** The backdrop clears as the photo is dragged away, so the screen beneath shows through. */
export function lightboxBackdropOpacity(translation: number, stageLength: number): number {
  'worklet';
  if (stageLength <= 0) return 1;
  return 1 - Math.min(1, Math.abs(translation) / (stageLength * LIGHTBOX_BACKDROP_CLEAR_SHARE));
}
