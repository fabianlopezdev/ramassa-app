/**
 * The frame of an opened gallery photo or video (RAPP-897).
 *
 * The frame runs across the full screen width and takes the shape of what it
 * shows, so the picture touches both edges. A very tall picture stops at the
 * height that still fits on the screen and is contained inside that frame.
 * Until the shape is known the frame keeps the 4:3 shape the screen had before.
 */
import type { VideoPlayerStatus } from 'expo-video';

export const GALLERY_MEDIA_FALLBACK_ASPECT_RATIO = 4 / 3;

/** The title on the media shows this many lines; a longer one is cut (RAPP-897). */
export const GALLERY_MEDIA_TITLE_MAX_LINES = 3;

/** Width over height of a picture or a video track, once both sides are known. */
export function mediaAspectRatioOf(
  size: { readonly width: number; readonly height: number } | null | undefined,
): number | null {
  if (size === null || size === undefined) return null;
  return size.width > 0 && size.height > 0 ? size.width / size.height : null;
}

export function galleryMediaFrameHeight({
  frameWidth,
  mediaAspectRatio,
  maxHeight,
}: {
  readonly frameWidth: number;
  /** Width over height of the picture or video; null while it is not known. */
  readonly mediaAspectRatio: number | null;
  /** The height that fits on the screen; null while it is not known. */
  readonly maxHeight: number | null;
}): number {
  const ownHeight = frameWidth / (mediaAspectRatio ?? GALLERY_MEDIA_FALLBACK_ASPECT_RATIO);
  return maxHeight === null ? ownHeight : Math.min(ownHeight, maxHeight);
}

type GalleryVideoTitleEvent =
  | { readonly type: 'tap' }
  | {
      readonly type: 'playingChange';
      readonly isPlaying: boolean;
      readonly status: VideoPlayerStatus;
    };

/**
 * Whether the title is on a video after something happened to it. The first
 * tap hides the title and starts the video. The title stays away while the
 * video plays and returns when it is paused or has ended. A video that stops
 * only to load more is still playing for her, so the title does not return.
 */
export function galleryVideoTitleVisibility(
  isVisible: boolean,
  event: GalleryVideoTitleEvent,
): boolean {
  if (event.type === 'tap' || event.isPlaying) return false;
  return event.status === 'readyToPlay' ? true : isVisible;
}
