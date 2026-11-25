/**
 * Paging between the photos of the lightbox (RAPP-931).
 *
 * The photos sit in a row, one stage width plus a gap apart. A horizontal
 * drag of an unzoomed photo moves the row, never further than the photo
 * before or after; on release the row turns to that photo when the drag went
 * far enough or was flicked that way, and otherwise settles back. With one
 * photo there is nothing to move to. In right-to-left languages the next
 * photo comes from the left.
 *
 * Plain numbers in and out, marked as worklets, so the gestures run them on
 * the UI thread and the tests run them as they are.
 */

/** A drag of this share of a page turns it on release. */
const LIGHTBOX_PAGE_TURN_DISTANCE_SHARE = 0.5;
/** A flick this fast, in points per second, turns it too. */
const LIGHTBOX_PAGE_TURN_VELOCITY = 500;

/** No direction yet: the drag has not been read. */
export const LIGHTBOX_DRAG_UNDECIDED = 0;
/** Sideways: the drag pages. */
export const LIGHTBOX_DRAG_SIDEWAYS = 1;
/** Up or down: the drag closes the lightbox. */
export const LIGHTBOX_DRAG_UPRIGHT = 2;

export type LightboxDragAxis =
  typeof LIGHTBOX_DRAG_UNDECIDED | typeof LIGHTBOX_DRAG_SIDEWAYS | typeof LIGHTBOX_DRAG_UPRIGHT;

/** 1 when the next photo is to the right, -1 in a right-to-left language. */
export function lightboxPageDirection(isRightToLeft: boolean): 1 | -1 {
  return isRightToLeft ? -1 : 1;
}

/** The way a drag goes, read once from its first movement and kept to its end. */
export function lightboxDragAxis(translationX: number, translationY: number): LightboxDragAxis {
  'worklet';
  if (translationX === 0 && translationY === 0) return LIGHTBOX_DRAG_UNDECIDED;
  return Math.abs(translationX) > Math.abs(translationY)
    ? LIGHTBOX_DRAG_SIDEWAYS
    : LIGHTBOX_DRAG_UPRIGHT;
}

interface LightboxPageDrag {
  /** The photo shown when the drag began. */
  readonly current: number;
  readonly count: number;
  /** The horizontal distance dragged, in points. */
  readonly translation: number;
  /** One page: the stage width plus the gap between photos. */
  readonly stride: number;
  /** From `lightboxPageDirection`. */
  readonly direction: 1 | -1;
}

/**
 * Where the row stands during the drag, in photos: the current one minus the
 * share of a page dragged, held between the photos next to it that exist.
 */
export function lightboxDragPosition({
  current,
  count,
  translation,
  stride,
  direction,
}: LightboxPageDrag): number {
  'worklet';
  if (stride <= 0) return current;
  const lowest = Math.max(0, current - 1);
  const highest = Math.min(count - 1, current + 1);
  const position = current - (translation * direction) / stride;
  return Math.min(highest, Math.max(lowest, position));
}

/** The photo the row settles on when the finger lifts. */
export function lightboxPageAfterDrag({
  velocity,
  ...drag
}: LightboxPageDrag & { readonly velocity: number }): number {
  'worklet';
  const { current, count, translation, stride, direction } = drag;
  const towardsNext = -translation * direction;
  const flickTowardsNext = -velocity * direction;
  const isFarEnough = Math.abs(towardsNext) > stride * LIGHTBOX_PAGE_TURN_DISTANCE_SHARE;
  const isFlicked =
    Math.abs(flickTowardsNext) > LIGHTBOX_PAGE_TURN_VELOCITY &&
    Math.sign(flickTowardsNext) === Math.sign(towardsNext);
  if (towardsNext === 0 || (!isFarEnough && !isFlicked)) return current;
  const target = current + Math.sign(towardsNext);
  return target < 0 || target >= count ? current : target;
}
