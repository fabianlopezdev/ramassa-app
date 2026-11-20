/**
 * An opened gallery photo or video (RAPP-897).
 *
 * It runs across the full width of its column, in the shape of what it shows,
 * with the title drawn on it. One tap on a photo hides the title and the next
 * tap brings it back. On a video the first tap hides the title and starts the
 * video; from then on the taps belong to the player, and the title returns
 * while the video is paused.
 */
import { ForumFlagButton } from '@/components/forum/forum-flag-button';
import { GalleryMediaTitle } from '@/components/gallery/gallery-media-title';
import { containedPictureCornerOffsets } from '@/lib/contained-picture-corner';
import {
  GALLERY_MEDIA_FALLBACK_ASPECT_RATIO,
  galleryMediaFrameHeight,
  galleryVideoTitleVisibility,
  mediaAspectRatioOf,
} from '@/lib/gallery-media-frame';
import { useEvent, useEventListener } from 'expo';
import { Image, type ImageLoadEventData, type ImageSource } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// A finished video reports a time this close to its length; a tap then starts it again.
const VIDEO_END_TOLERANCE_SECONDS = 0.25;
const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: tokens.colors.neutral[900],
  },
  unmeasuredFrame: { aspectRatio: GALLERY_MEDIA_FALLBACK_ASPECT_RATIO },
  media: { flex: 1 },
});

/**
 * The frame's height for what it shows, and where that picture's bottom edge
 * is inside the frame. A picture taller than the screen is contained, so it
 * leaves an even band on both sides, and the title stays on the picture.
 */
function useMediaFrame(mediaAspectRatio: number | null, maxHeight: number | null) {
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const measureFrame = useCallback(
    (event: LayoutChangeEvent) => setFrameWidth(event.nativeEvent.layout.width),
    [],
  );
  const frameStyle = useMemo<ViewStyle>(
    () =>
      frameWidth === null
        ? styles.unmeasuredFrame
        : { height: galleryMediaFrameHeight({ frameWidth, mediaAspectRatio, maxHeight }) },
    [frameWidth, maxHeight, mediaAspectRatio],
  );
  const onPictureStyle = useMemo<ViewStyle>(() => {
    if (frameWidth === null) return { position: 'absolute', start: 0, end: 0, bottom: 0 };
    const frameAspectRatio =
      frameWidth / galleryMediaFrameHeight({ frameWidth, mediaAspectRatio, maxHeight });
    const { end, bottom } = containedPictureCornerOffsets({
      frameWidth,
      frameAspectRatio,
      pictureAspectRatio: mediaAspectRatio ?? frameAspectRatio,
      inset: 0,
    });
    return { position: 'absolute', start: end, end, bottom };
  }, [frameWidth, maxHeight, mediaAspectRatio]);
  return { measureFrame, frameStyle, onPictureStyle };
}

interface GalleryMediaStageProps {
  /** What the screen reader says for the photo or the video. */
  readonly accessibilityLabel: string;
  /** The item's title, drawn on the media; null when it has none. */
  readonly title: string | null;
  readonly fontClass: string;
  /** The height that fits on the screen; null while it is not known. */
  readonly maxHeight: number | null;
  readonly onTitleCutChange: (isCut: boolean) => void;
}

export const GalleryPhotoStage = memo(function GalleryPhotoStage({
  source,
  accessibilityLabel,
  title,
  fontClass,
  maxHeight,
  onTitleCutChange,
  flagAccessibilityLabel,
  onFlag,
}: GalleryMediaStageProps & {
  readonly source: ImageSource;
  /** The report flag's label; null when she cannot report this photo (her own). */
  readonly flagAccessibilityLabel: string | null;
  readonly onFlag: () => void;
}) {
  const [pictureAspectRatio, setPictureAspectRatio] = useState<number | null>(null);
  const [isTitleVisible, setIsTitleVisible] = useState(true);
  const { measureFrame, frameStyle, onPictureStyle } = useMediaFrame(pictureAspectRatio, maxHeight);
  const recordPictureShape = useCallback(
    ({ source: loaded }: ImageLoadEventData) => setPictureAspectRatio(mediaAspectRatioOf(loaded)),
    [],
  );
  const toggleTitle = useCallback(() => setIsTitleVisible((isVisible) => !isVisible), []);
  const frame = useMemo(() => [styles.frame, frameStyle], [frameStyle]);
  return (
    <Pressable
      testID="gallery-photo-frame"
      accessible={false}
      disabled={title === null}
      onPress={toggleTitle}
      onLayout={measureFrame}
      style={frame}
    >
      <Image
        source={source}
        accessibilityLabel={accessibilityLabel}
        cachePolicy="memory-disk"
        contentFit="contain"
        style={styles.media}
        onLoad={recordPictureShape}
      />
      {title === null && flagAccessibilityLabel === null ? null : (
        <GalleryMediaTitle
          style={onPictureStyle}
          title={title}
          isVisible={isTitleVisible}
          fontClass={fontClass}
          onCutChange={onTitleCutChange}
          endAction={
            flagAccessibilityLabel === null ? null : (
              <ForumFlagButton
                testID="gallery-flag"
                accessibilityLabel={flagAccessibilityLabel}
                onPress={onFlag}
              />
            )
          }
        />
      )}
    </Pressable>
  );
});

export const GalleryVideoStage = memo(function GalleryVideoStage({
  source,
  accessibilityLabel,
  title,
  fontClass,
  maxHeight,
  onTitleCutChange,
}: GalleryMediaStageProps & { readonly source: VideoSource }) {
  const player = useVideoPlayer(source);
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });
  const loadedSource = useEvent(player, 'sourceLoad');
  const videoAspectRatio = mediaAspectRatioOf(
    videoTrack?.size ?? loadedSource?.availableVideoTracks[0]?.size,
  );
  const [isTitleVisible, setIsTitleVisible] = useState(true);
  const { measureFrame, frameStyle, onPictureStyle } = useMediaFrame(videoAspectRatio, maxHeight);
  useEventListener(player, 'playingChange', ({ isPlaying }) =>
    setIsTitleVisible((isVisible) =>
      galleryVideoTitleVisibility(isVisible, {
        type: 'playingChange',
        isPlaying,
        status: player.status,
      }),
    ),
  );
  const hideTitleAndPlay = useCallback(() => {
    setIsTitleVisible((isVisible) => galleryVideoTitleVisibility(isVisible, { type: 'tap' }));
    const hasEnded =
      player.duration > 0 && player.currentTime >= player.duration - VIDEO_END_TOLERANCE_SECONDS;
    if (hasEnded) player.replay();
    else player.play();
  }, [player]);
  const frame = useMemo(() => [styles.frame, frameStyle], [frameStyle]);
  return (
    <View onLayout={measureFrame} style={frame}>
      <VideoView
        player={player}
        nativeControls
        accessibilityLabel={accessibilityLabel}
        contentFit="contain"
        style={styles.media}
      />
      {/* While the title is on the video, this layer takes the tap: it hides
          the title and starts the video. With the title away it is gone, and
          every tap reaches the player's own controls. */}
      {title === null || !isTitleVisible ? null : (
        <Pressable
          testID="gallery-video-first-tap"
          accessible={false}
          onPress={hideTitleAndPlay}
          className="absolute inset-0"
        >
          <GalleryMediaTitle
            style={onPictureStyle}
            title={title}
            isVisible
            fontClass={fontClass}
            onCutChange={onTitleCutChange}
          />
        </Pressable>
      )}
    </View>
  );
});
