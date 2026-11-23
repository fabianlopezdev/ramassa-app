/**
 * Photos at full screen on black (RAPP-913), one at a time, with a swipe to
 * the photo before or after it (RAPP-931).
 *
 * Each photo is fitted inside the safe area. Pinch or double tap to zoom, drag
 * to move a zoomed photo, and drag the unzoomed photo up or down, or press the
 * close button, to leave. A sideways drag of an unzoomed photo pages to the
 * next or previous photo; with one photo nothing pages. A single tap hides the
 * overlay at the foot of the photo and shows it again. The status bar is
 * hidden while it is open.
 *
 * The photos sit in one row that moves under the finger: the current photo and
 * the one on each side are drawn, each at its own place in the row, so turning
 * a page moves the row and nothing jumps. The zoom belongs to the current photo
 * only. Every gesture runs on the UI thread (Gesture Handler with Reanimated);
 * the zoom arithmetic lives in `lib/photo-lightbox-zoom` and the paging in
 * `lib/photo-lightbox-paging`. Under reduced motion the photo settles and the
 * page turns at once.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PhotoFade } from '@/components/media/photo-fade';
import { NativeWindAnimatedView } from '@/components/motion/nativewind-animated-view';
import { mediaAspectRatioOf } from '@/lib/gallery-media-frame';
import {
  LIGHTBOX_DRAG_SIDEWAYS,
  LIGHTBOX_DRAG_UNDECIDED,
  LIGHTBOX_DRAG_UPRIGHT,
  lightboxDragAxis,
  lightboxDragPosition,
  lightboxPageAfterDrag,
  lightboxPageDirection,
  type LightboxDragAxis,
} from '@/lib/photo-lightbox-paging';
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
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  I18nManager,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';
import { motionTokens, resolveDurationMs } from '@ramassa/shared/tokens/motion';

/** The black gap between two photos while the row moves. */
const LIGHTBOX_PAGE_GAP = tokens.spacing.lg;
/** The most of the screen the overlay takes; a longer title scrolls inside it. */
const LIGHTBOX_OVERLAY_MAX_SHARE_OF_SCREEN = 0.5;
const PAGE_ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: tokens.colors.black },
});

export interface LightboxPhoto {
  /** Stays with the photo, such as its id. */
  readonly key: string;
  /** Null while the photo is not known: its page stays black. */
  readonly source: ImageSource | null;
  /** What the screen reader says for the photo. */
  readonly accessibilityLabel: string;
}

/** The shared values every page reads to draw itself in the row. */
interface LightboxMotion {
  readonly stageWidth: SharedValue<number>;
  readonly shownIndex: SharedValue<number>;
  readonly scale: SharedValue<number>;
  readonly offsetX: SharedValue<number>;
  readonly offsetY: SharedValue<number>;
  readonly dismissY: SharedValue<number>;
}

/**
 * One photo at its place in the row. Only the photo shown takes the zoom and
 * the drag to close; the ones beside it wait at their fitted size.
 */
const LightboxPage = memo(function LightboxPage({
  photo,
  position,
  direction,
  motion,
  isCurrent,
  isAdjustable,
  onPhotoLoad,
  onAccessibilityAction,
}: {
  readonly photo: LightboxPhoto;
  /** Its place in the row, counted from the first photo. */
  readonly position: number;
  readonly direction: 1 | -1;
  readonly motion: LightboxMotion;
  readonly isCurrent: boolean;
  /** More than one photo: the screen reader turns the pages by swiping up or down. */
  readonly isAdjustable: boolean;
  readonly onPhotoLoad: (key: string, aspectRatio: number | null) => void;
  readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
}) {
  const { stageWidth, shownIndex, scale, offsetX, offsetY, dismissY } = motion;
  const placeStyle = useAnimatedStyle(() => {
    const place = position * (stageWidth.get() + LIGHTBOX_PAGE_GAP) * direction;
    const isShown = shownIndex.get() === position;
    return {
      transform: [
        { translateX: place + (isShown ? offsetX.get() : 0) },
        { translateY: isShown ? offsetY.get() + dismissY.get() : 0 },
        { scale: isShown ? scale.get() : LIGHTBOX_MIN_SCALE },
      ],
    };
  });
  const pageStyle = useMemo(() => [StyleSheet.absoluteFill, placeStyle], [placeStyle]);
  const recordShape = useCallback(
    ({ source }: ImageLoadEventData) => onPhotoLoad(photo.key, mediaAspectRatioOf(source)),
    [onPhotoLoad, photo.key],
  );
  return (
    <NativeWindAnimatedView
      testID={isCurrent ? 'photo-lightbox-current' : undefined}
      style={pageStyle}
      accessible={isCurrent}
      accessibilityRole={isAdjustable ? 'adjustable' : 'image'}
      accessibilityLabel={photo.accessibilityLabel}
      accessibilityActions={isAdjustable ? PAGE_ACCESSIBILITY_ACTIONS : undefined}
      onAccessibilityAction={isAdjustable ? onAccessibilityAction : undefined}
      accessibilityElementsHidden={!isCurrent}
      importantForAccessibility={isCurrent ? 'yes' : 'no-hide-descendants'}
    >
      {photo.source === null ? null : (
        <Image
          source={photo.source}
          accessible={false}
          cachePolicy="memory-disk"
          contentFit="contain"
          transition={motionTokens.duration.fast}
          style={StyleSheet.absoluteFill}
          onLoad={recordShape}
        />
      )}
    </NativeWindAnimatedView>
  );
});

export function PhotoLightbox({
  photos,
  currentKey,
  onCurrentKeyChange,
  closeLabel,
  onClose,
  overlay,
}: {
  /** In the order she swipes through them. Empty while none is known: it stays black with its close button. */
  readonly photos: readonly LightboxPhoto[];
  /** The photo shown. */
  readonly currentKey: string;
  /** After a swipe or a screen reader swipe has turned to another photo. */
  readonly onCurrentKeyChange: (key: string) => void;
  readonly closeLabel: string;
  readonly onClose: () => void;
  /** About the photo shown, at its foot; a single tap hides it and shows it again. */
  readonly overlay?: ReactNode;
}) {
  const isReducedMotion = useReducedMotion();
  const { top, bottom } = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const settle = useMemo(
    () => ({ duration: resolveDurationMs('base', isReducedMotion) }),
    [isReducedMotion],
  );
  const overlayFade = useMemo(
    () => ({ duration: resolveDurationMs('fast', isReducedMotion) }),
    [isReducedMotion],
  );
  const direction = lightboxPageDirection(I18nManager.isRTL);
  const pageCount = photos.length;
  const currentIndex = Math.max(
    0,
    photos.findIndex((photo) => photo.key === currentKey),
  );
  const currentPhotoKey = photos[currentIndex]?.key;

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
  const shownIndex = useSharedValue(currentIndex);
  const shownCount = useSharedValue(pageCount);
  const pagePosition = useSharedValue(currentIndex);
  const dragAxis = useSharedValue<LightboxDragAxis>(LIGHTBOX_DRAG_UNDECIDED);
  const overlayOpacity = useSharedValue(1);
  const [isOverlayShown, setIsOverlayShown] = useState(true);
  // The shape of every photo loaded so far, so a photo turned to zooms to its own edges.
  const [photoShapes] = useState(() => new Map<string, number>());

  // The row stands on the photo shown, also when the list around it changes.
  useLayoutEffect(() => {
    shownIndex.set(currentIndex);
    shownCount.set(pageCount);
    pagePosition.set(currentIndex);
  }, [currentIndex, pageCount, pagePosition, shownCount, shownIndex]);
  // Another photo starts at its fitted size.
  useLayoutEffect(() => {
    scale.set(LIGHTBOX_MIN_SCALE);
    offsetX.set(0);
    offsetY.set(0);
    dismissY.set(0);
    photoAspectRatio.set(
      currentPhotoKey === undefined ? null : (photoShapes.get(currentPhotoKey) ?? null),
    );
  }, [currentPhotoKey, dismissY, offsetX, offsetY, photoAspectRatio, photoShapes, scale]);
  useEffect(() => {
    overlayOpacity.set(withTiming(isOverlayShown ? 1 : 0, overlayFade));
  }, [isOverlayShown, overlayFade, overlayOpacity]);

  const measureStage = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      stageWidth.set(nativeEvent.layout.width);
      stageHeight.set(nativeEvent.layout.height);
    },
    [stageHeight, stageWidth],
  );
  const recordPhotoShape = useCallback(
    (key: string, aspectRatio: number | null) => {
      if (aspectRatio === null) return;
      photoShapes.set(key, aspectRatio);
      if (key === currentPhotoKey) photoAspectRatio.set(aspectRatio);
    },
    [currentPhotoKey, photoAspectRatio, photoShapes],
  );
  const showPage = useCallback(
    (index: number) => {
      const photo = photos[index];
      if (photo !== undefined && photo.key !== currentKey) onCurrentKeyChange(photo.key);
    },
    [currentKey, onCurrentKeyChange, photos],
  );
  const toggleOverlay = useCallback(() => setIsOverlayShown((isShown) => !isShown), []);
  // A screen reader swipe up or down turns the page, as a sideways drag does.
  const turnPageForScreenReader = useCallback(
    ({ nativeEvent }: AccessibilityActionEvent) => {
      const target = currentIndex + (nativeEvent.actionName === 'increment' ? 1 : -1);
      if (target < 0 || target >= pageCount || scale.get() > LIGHTBOX_MIN_SCALE) return;
      pagePosition.set(
        withTiming(target, settle, (isFinished) => {
          if (isFinished) runOnJS(showPage)(target);
        }),
      );
    },
    [currentIndex, pageCount, pagePosition, scale, settle, showPage],
  );
  const motion = useMemo<LightboxMotion>(
    () => ({ stageWidth, shownIndex, scale, offsetX, offsetY, dismissY }),
    [dismissY, offsetX, offsetY, scale, shownIndex, stageWidth],
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

    // One finger: it moves a zoomed photo. On the fitted photo it pages when
    // it goes sideways, and drags the photo away to close when it goes up or down.
    const pan = Gesture.Pan()
      .maxPointers(1)
      .onStart(() => {
        startX.set(offsetX.get());
        startY.set(offsetY.get());
        dragAxis.set(LIGHTBOX_DRAG_UNDECIDED);
      })
      .onUpdate((event) => {
        const current = scale.get();
        if (current <= LIGHTBOX_MIN_SCALE) {
          let axis = dragAxis.get();
          if (axis === LIGHTBOX_DRAG_UNDECIDED) {
            axis = lightboxDragAxis(event.translationX, event.translationY);
            dragAxis.set(axis);
          }
          if (axis === LIGHTBOX_DRAG_UPRIGHT) {
            dismissY.set(event.translationY);
          } else if (axis === LIGHTBOX_DRAG_SIDEWAYS) {
            pagePosition.set(
              lightboxDragPosition({
                current: shownIndex.get(),
                count: shownCount.get(),
                translation: event.translationX,
                stride: stageWidth.get() + LIGHTBOX_PAGE_GAP,
                direction,
              }),
            );
          }
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
        const axis = dragAxis.get();
        dragAxis.set(LIGHTBOX_DRAG_UNDECIDED);
        const current = scale.get();
        if (axis === LIGHTBOX_DRAG_SIDEWAYS) {
          // A pinch that began during the drag keeps the photo where it is.
          const shown = shownIndex.get();
          const target =
            current > LIGHTBOX_MIN_SCALE
              ? shown
              : lightboxPageAfterDrag({
                  current: shown,
                  count: shownCount.get(),
                  translation: event.translationX,
                  velocity: event.velocityX,
                  stride: stageWidth.get() + LIGHTBOX_PAGE_GAP,
                  direction,
                });
          pagePosition.set(
            withTiming(target, settle, (isFinished) => {
              if (isFinished && target !== shown) runOnJS(showPage)(target);
            }),
          );
          return;
        }
        if (current <= LIGHTBOX_MIN_SCALE) {
          if (axis !== LIGHTBOX_DRAG_UPRIGHT) return;
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

    // A single tap, once it is clear no second tap follows, hides or shows the overlay.
    const singleTap = Gesture.Tap().onEnd((_event, success) => {
      if (success) runOnJS(toggleOverlay)();
    });

    return Gesture.Race(Gesture.Exclusive(doubleTap, singleTap), Gesture.Simultaneous(pinch, pan));
  }, [
    anchorX,
    anchorY,
    direction,
    dismissY,
    dragAxis,
    isReducedMotion,
    offsetX,
    offsetY,
    onClose,
    pagePosition,
    photoAspectRatio,
    scale,
    settle,
    showPage,
    shownCount,
    shownIndex,
    stageHeight,
    stageWidth,
    startScale,
    startX,
    startY,
    toggleOverlay,
  ]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: lightboxBackdropOpacity(dismissY.get(), stageHeight.get()),
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: lightboxBackdropOpacity(dismissY.get(), stageHeight.get()),
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.get() * lightboxBackdropOpacity(dismissY.get(), stageHeight.get()),
  }));
  const rowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -pagePosition.get() * (stageWidth.get() + LIGHTBOX_PAGE_GAP) * direction },
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
  const overlayPlaceStyle = useMemo<ViewStyle>(
    () => ({ position: 'absolute', bottom: 0, start: 0, end: 0 }),
    [],
  );
  const overlayContentStyle = useMemo<ViewStyle>(
    () => ({ paddingBottom: bottom + tokens.spacing.md }),
    [bottom],
  );
  const overlayScrollStyle = useMemo<ViewStyle>(
    () => ({ maxHeight: windowHeight * LIGHTBOX_OVERLAY_MAX_SHARE_OF_SCREEN }),
    [windowHeight],
  );
  const rowLayerStyle = useMemo(() => [StyleSheet.absoluteFill, rowStyle], [rowStyle]);
  const backdropLayerStyle = useMemo(() => [styles.backdrop, backdropStyle], [backdropStyle]);
  const closeLayerStyle = useMemo(
    () => [closeCornerStyle, closeStyle],
    [closeCornerStyle, closeStyle],
  );
  const overlayLayerStyle = useMemo(
    () => [overlayPlaceStyle, overlayStyle],
    [overlayPlaceStyle, overlayStyle],
  );
  const firstDrawn = Math.max(0, currentIndex - 1);
  const drawnPhotos = photos.slice(firstDrawn, currentIndex + 2);

  return (
    <View testID="photo-lightbox" className="flex-1" onAccessibilityEscape={onClose}>
      <StatusBar style="light" hidden animated={!isReducedMotion} />
      <NativeWindAnimatedView pointerEvents="none" style={backdropLayerStyle} />
      <GestureDetector gesture={gesture}>
        <View collapsable={false} style={stageStyle} onLayout={measureStage}>
          <NativeWindAnimatedView style={rowLayerStyle}>
            {drawnPhotos.map((photo, offset) => {
              const position = firstDrawn + offset;
              return (
                <LightboxPage
                  key={photo.key}
                  photo={photo}
                  position={position}
                  direction={direction}
                  motion={motion}
                  isCurrent={position === currentIndex}
                  isAdjustable={pageCount > 1}
                  onPhotoLoad={recordPhotoShape}
                  onAccessibilityAction={turnPageForScreenReader}
                />
              );
            })}
          </NativeWindAnimatedView>
        </View>
      </GestureDetector>
      {overlay === undefined ? null : (
        <NativeWindAnimatedView
          testID="photo-lightbox-overlay"
          pointerEvents={isOverlayShown ? 'box-none' : 'none'}
          accessibilityElementsHidden={!isOverlayShown}
          importantForAccessibility={isOverlayShown ? 'auto' : 'no-hide-descendants'}
          style={overlayLayerStyle}
        >
          <PhotoFade color={tokens.colors.black} pointerEvents="box-none" className="pt-3xl">
            <ScrollView
              style={overlayScrollStyle}
              contentContainerStyle={overlayContentStyle}
              contentContainerClassName="gap-md px-lg"
              bounces={false}
            >
              {overlay}
            </ScrollView>
          </PhotoFade>
        </NativeWindAnimatedView>
      )}
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
