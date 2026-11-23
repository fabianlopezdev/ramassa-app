/**
 * The part of a photo that stays visible when a card, a tile or the photo at
 * the top of a screen crops it (RAPP-932).
 *
 * Whoever adds a photo may choose a focus: a point across (`x`, 0 left to 1
 * right) and down (`y`, 0 top to 1 bottom) the photo. It is stored with the
 * photo as two nullable numbers. Without a choice, a tall photo keeps its top
 * third and a wide one its middle.
 *
 * The focus is used as the photo's position in its frame, the way CSS
 * `object-position` and expo-image `contentPosition` read percentages: at
 * 0 the photo's top edge meets the frame's top edge, at 1 the bottoms meet.
 * So the chosen point is always inside what the frame keeps, whatever the
 * frame's shape, and the picker can show the crop without knowing the screen.
 */
import { z } from 'zod';

export const photoFocusSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type PhotoFocus = z.infer<typeof photoFocusSchema>;

/** A photo taller than wide keeps its top third, where faces usually are. */
export const TALL_PHOTO_DEFAULT_FOCUS: PhotoFocus = { x: 0.5, y: 1 / 3 };
/** A wide or square photo keeps its middle. */
export const WIDE_PHOTO_DEFAULT_FOCUS: PhotoFocus = { x: 0.5, y: 0.5 };

/** Stored with three decimals: finer than any screen shows. */
const FOCUS_DECIMALS = 1_000;

/**
 * The crop when nobody chose one. `aspectRatio` is width over height, or null
 * while the photo's shape is not known yet: then the top third, since a tall
 * photo is the one that loses most to a wide card.
 */
export function defaultPhotoFocus(aspectRatio: number | null): PhotoFocus {
  return aspectRatio !== null && aspectRatio >= 1
    ? WIDE_PHOTO_DEFAULT_FOCUS
    : TALL_PHOTO_DEFAULT_FOCUS;
}

/** The chosen focus, or the default for the photo's shape. */
export function resolvePhotoFocus(chosen: PhotoFocus | null, aspectRatio: number | null) {
  return chosen ?? defaultPhotoFocus(aspectRatio);
}

/**
 * One object per stored focus, so a list that reads the same row again hands
 * its memoised card the same focus and the card does not draw again.
 */
const focusesByColumns = new Map<string, PhotoFocus>();

/** The focus of a stored row: both columns, or no choice. */
export function photoFocusFromColumns(
  x: number | null | undefined,
  y: number | null | undefined,
): PhotoFocus | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const key = `${x}:${y}`;
  const known = focusesByColumns.get(key);
  if (known !== undefined) return known;
  const focus: PhotoFocus = Object.freeze({ x, y });
  focusesByColumns.set(key, focus);
  return focus;
}

/** The two columns a focus is stored in; no choice stores two nulls. */
export function photoFocusColumns(focus: PhotoFocus | null): {
  readonly x: number | null;
  readonly y: number | null;
} {
  return { x: focus?.x ?? null, y: focus?.y ?? null };
}

function clampToPhoto(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * FOCUS_DECIMALS) / FOCUS_DECIMALS;
}

/**
 * Where a finger or a pointer touched the whole photo, drawn `width` by
 * `height`, as a focus. A drag past the edge stays on the edge.
 */
export function photoFocusFromPoint(
  pointX: number,
  pointY: number,
  width: number,
  height: number,
): PhotoFocus {
  if (width <= 0 || height <= 0) return WIDE_PHOTO_DEFAULT_FOCUS;
  return { x: clampToPhoto(pointX / width), y: clampToPhoto(pointY / height) };
}

function percentage(value: number): string {
  return `${Math.round(value * FOCUS_DECIMALS) / 10}%`;
}

/** The focus as the photo's position in its frame: expo-image `contentPosition`, CSS `object-position`. */
export function photoFocusPercentages(focus: PhotoFocus): {
  readonly left: string;
  readonly top: string;
} {
  return { left: percentage(focus.x), top: percentage(focus.y) };
}

/** The part of the photo a frame keeps, as shares of the photo's width and height. */
export interface PhotoCropWindow {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What a frame of `frameAspectRatio` keeps of a photo of `photoAspectRatio`
 * filled into it (cover) at `focus`. Both ratios are width over height.
 */
export function photoCropWindow(
  focus: PhotoFocus,
  photoAspectRatio: number,
  frameAspectRatio: number,
): PhotoCropWindow {
  if (photoAspectRatio > frameAspectRatio) {
    const width = frameAspectRatio / photoAspectRatio;
    return { left: focus.x * (1 - width), top: 0, width, height: 1 };
  }
  const height = photoAspectRatio / frameAspectRatio;
  return { left: 0, top: focus.y * (1 - height), width: 1, height };
}
