/**
 * A photo on its own, at full screen on black (RAPP-913).
 *
 * The photo is fitted inside the safe area. Pinch or double tap to zoom, drag
 * to move a zoomed photo, and drag the unzoomed photo up or down, or press the
 * close button, to leave. The status bar is hidden while it is open.
 *
 * The gestures run on the UI thread (Gesture Handler with Reanimated), and the
 * zoom arithmetic lives in `lib/photo-lightbox-zoom`. Under reduced motion the
 * photo settles at once instead of easing back.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { NativeWindAnimatedView } from '@/components/motion/nativewind-animated-view';
import { mediaAspectRatioOf } from '@/lib/gallery-media-frame';
import {
  clampLightboxOffset,
  clampLightboxScale,
  fittedPhotoSize,
  LIGHTBOX_DOUBLE_TAP_SCALE,
  LIGHTBOX_MIN_SCALE,
  lightboxAnchor,
  lightboxBackdropOpacity,
  lightboxOffsetKeepingAnchor,
  lightboxPanLimit,
  shouldDismissLightbox,
} from '@/lib/photo-lightbox-zoom';
import { Image, type ImageLoadEventData, type ImageSource } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';
import { motionTokens, resolveDurationMs } from '@ramassa/shared/tokens/motion';

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: tokens.colors.black },
});

export function PhotoLightbox({
  source,
  accessibilityLabel,
  closeLabel,
  onClose,
}: {
  /** Null while the photo is not known: the lightbox stays black with its close button. */
  readonly source: ImageSource | null;
  /** What the screen reader says for the photo. */
  readonly accessibilityLabel: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
}) {
  const isReducedMotion = useReducedMotion();
  const { top, bottom } = useSafeAreaInsets();
  const settle = useMemo(
    () => ({ duration: resolveDurationMs('base', isReducedMotion) }),
    [isReducedMotion],
  );

  const stageWidth = useSharedValue(0);
  const stageHeight = useSharedValue(0);
  const photoAspectRatio = useSharedValue<number | null>(null);
  const scale = useSharedValue(LIGHTBOX_MIN_SCALE);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const startScale = useSharedValue(LIGHTBOX_MIN_SCALE);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);

  const measureStage = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      stageWidth.set(nativeEvent.layout.width);
      stageHeight.set(nativeEvent.layout.height);
    },
    [stageHeight, stageWidth],
  );
  const recordPhotoShape = useCallback(
    ({ source: loaded }: ImageLoadEventData) => photoAspectRatio.set(mediaAspectRatioOf(loaded)),
    [photoAspectRatio],
  );

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart((event) => {
        const current = scale.get();
        startScale.set(current);
        anchorX.set(
          lightboxAnchor({
            focal: event.focalX,
            stageLength: stageWidth.get(),
            offset: offsetX.get(),
            scale: current,
          }),
        );
        anchorY.set(
          lightboxAnchor({
            focal: event.focalY,
            stageLength: stageHeight.get(),
            offset: offsetY.get(),
            scale: current,
          }),
        );
      })
      .onUpdate((event) => {
        const next = clampLightboxScale(startScale.get() * event.scale);
        const stage = { width: stageWidth.get(), height: stageHeight.get() };
        const photo = fittedPhotoSize(stage, photoAspectRatio.get());
        scale.set(next);
        offsetX.set(
          clampLightboxOffset(
            lightboxOffsetKeepingAnchor({
              focal: event.focalX,
              stageLength: stage.width,
              anchor: anchorX.get(),
              scale: next,
            }),
            lightboxPanLimit(stage.width, photo.width, next),
          ),
        );
        offsetY.set(
          clampLightboxOffset(
            lightboxOffsetKeepingAnchor({
              focal: event.focalY,
              stageLength: stage.height,
              anchor: anchorY.get(),
              scale: next,
            }),
            lightboxPanLimit(stage.height, photo.height, next),
          ),
        );
      });

    // One finger: it moves a zoomed photo, or drags the fitted one away to close.
    const pan = Gesture.Pan()
      .maxPointers(1)
      .onStart(() => {
        startX.set(offsetX.get());
        startY.set(offsetY.get());
      })
      .onUpdate((event) => {
        const current = scale.get();
        if (current <= LIGHTBOX_MIN_SCALE) {
          dismissY.set(event.translationY);
          return;
        }
        const stage = { width: stageWidth.get(), height: stageHeight.get() };
        const photo = fittedPhotoSize(stage, photoAspectRatio.get());
        offsetX.set(
          clampLightboxOffset(
            startX.get() + event.translationX,
            lightboxPanLimit(stage.width, photo.width, current),
          ),
        );
        offsetY.set(
          clampLightboxOffset(
            startY.get() + event.translationY,
            lightboxPanLimit(stage.height, photo.height, current),
          ),
        );
      })
      .onEnd((event) => {
        const current = scale.get();
        if (current <= LIGHTBOX_MIN_SCALE) {
          if (
            shouldDismissLightbox({
              translation: event.translationY,
              velocity: event.velocityY,
              stageLength: stageHeight.get(),
            })
          ) {
            runOnJS(onClose)();
          } else {
            dismissY.set(withTiming(0, settle));
          }
          return;
        }
        if (isReducedMotion) return;
        const stage = { width: stageWidth.get(), height: stageHeight.get() };
        const photo = fittedPhotoSize(stage, photoAspectRatio.get());
        const limitX = lightboxPanLimit(stage.width, photo.width, current);
        const limitY = lightboxPanLimit(stage.height, photo.height, current);
        offsetX.set(withDecay({ velocity: event.velocityX, clamp: [-limitX, limitX] }));
        offsetY.set(withDecay({ velocity: event.velocityY, clamp: [-limitY, limitY] }));
      });

    // A double tap zooms in on the point tapped, or back out to the fitted photo.
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((event, success) => {
        if (!success) return;
        if (scale.get() > LIGHTBOX_MIN_SCALE) {
          scale.set(withTiming(LIGHTBOX_MIN_SCALE, settle));
          offsetX.set(withTiming(0, settle));
          offsetY.set(withTiming(0, settle));
          return;
        }
        const stage = { width: stageWidth.get(), height: stageHeight.get() };
        const photo = fittedPhotoSize(stage, photoAspectRatio.get());
        const zoomedOffset = (focal: number, stageLength: number, photoLength: number) =>
          clampLightboxOffset(
            lightboxOffsetKeepingAnchor({
              focal,
              stageLength,
              anchor: lightboxAnchor({ focal, stageLength, offset: 0, scale: LIGHTBOX_MIN_SCALE }),
              scale: LIGHTBOX_DOUBLE_TAP_SCALE,
            }),
            lightboxPanLimit(stageLength, photoLength, LIGHTBOX_DOUBLE_TAP_SCALE),
          );
        scale.set(withTiming(LIGHTBOX_DOUBLE_TAP_SCALE, settle));
        offsetX.set(withTiming(zoomedOffset(event.x, stage.width, photo.width), settle));
        offsetY.set(withTiming(zoomedOffset(event.y, stage.height, photo.height), settle));
      });

    return Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));
  }, [
    anchorX,
    anchorY,
    dismissY,
    isReducedMotion,
    offsetX,
    offsetY,
    onClose,
    photoAspectRatio,
    scale,
    settle,
    stageHeight,
    stageWidth,
    startScale,
    startX,
    startY,
  ]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: lightboxBackdropOpacity(dismissY.get(), stageHeight.get()),
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: lightboxBackdropOpacity(dismissY.get(), stageHeight.get()),
  }));
  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.get() },
      { translateY: offsetY.get() + dismissY.get() },
      { scale: scale.get() },
    ],
  }));
  const stageStyle = useMemo<ViewStyle>(
    () => ({ position: 'absolute', top, bottom, start: 0, end: 0 }),
    [bottom, top],
  );
  const closeCornerStyle = useMemo<ViewStyle>(
    () => ({ position: 'absolute', top: top + tokens.spacing.sm, end: tokens.spacing.md }),
    [top],
  );
  const photoFrameStyle = useMemo(() => [StyleSheet.absoluteFill, photoStyle], [photoStyle]);
  const backdropLayerStyle = useMemo(() => [styles.backdrop, backdropStyle], [backdropStyle]);
  const closeLayerStyle = useMemo(
    () => [closeCornerStyle, closeStyle],
    [closeCornerStyle, closeStyle],
  );

  return (
    <View testID="photo-lightbox" className="flex-1" onAccessibilityEscape={onClose}>
      <StatusBar style="light" hidden animated={!isReducedMotion} />
      <NativeWindAnimatedView pointerEvents="none" style={backdropLayerStyle} />
      <GestureDetector gesture={gesture}>
        <View collapsable={false} style={stageStyle} onLayout={measureStage}>
          <NativeWindAnimatedView style={photoFrameStyle}>
            {source === null ? null : (
              <Image
                source={source}
                accessibilityLabel={accessibilityLabel}
                cachePolicy="memory-disk"
                contentFit="contain"
                transition={motionTokens.duration.fast}
                style={StyleSheet.absoluteFill}
                onLoad={recordPhotoShape}
              />
            )}
          </NativeWindAnimatedView>
        </View>
      </GestureDetector>
      <NativeWindAnimatedView style={closeLayerStyle}>
        <RaisedActionButton
          testID="photo-lightbox-close"
          size="compact"
          icon="close"
          isLabelHidden
          label={closeLabel}
          onPress={onClose}
        />
      </NativeWindAnimatedView>
    </View>
  );
}
