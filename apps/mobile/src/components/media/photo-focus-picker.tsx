/**
 * Choosing the part of a photo that cards keep (RAPP-932). Every screen where
 * a photo is added or replaced shows this under it: the staff avís and service
 * editors, a player's forum post and her gallery upload.
 *
 * The whole photo is shown with the card's frame over it, the rest dimmed. A
 * tap or a drag on the photo moves the frame there, live, so she sees what
 * the card will keep. Without a choice the frame shows the default crop, and
 * nothing is stored. The reset goes back to it.
 *
 * The frame is the card's landscape shape, or the square of a gallery tile.
 */
import { FieldLabel } from '@/components/forms/field-label';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image, type ImageLoadEventData, type ImageSource } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Text,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type ImageStyle,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import {
  photoCropWindow,
  photoFocusFromPoint,
  resolvePhotoFocus,
  type PhotoFocus,
} from '@ramassa/shared/photo-focus';
import { tokens } from '@ramassa/shared/tokens';

/** The most of the screen's height the photo takes, so the form stays in view. */
const PICKER_MAX_SHARE_OF_SCREEN = 0.5;
/** How far one screen reader swipe moves the point down or up the photo. */
const SCREEN_READER_STEP = 0.1;
const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

export interface PhotoFocusPickerProps {
  readonly source: ImageSource;
  /** Width over height when the photo's size is known, as for one just picked; the loaded photo corrects it. */
  readonly aspectRatio?: number | null;
  /** The chosen point; null shows the default crop and stores nothing. */
  readonly focus: PhotoFocus | null;
  readonly onChange: (focus: PhotoFocus | null) => void;
  /** The shape the photo is shown in: the card's by default. */
  readonly frameAspectRatio?: number;
  readonly testID?: string;
}

export function PhotoFocusPicker({
  source,
  aspectRatio = null,
  focus,
  onChange,
  frameAspectRatio = tokens.photoCard.aspectRatio,
  testID = 'photo-focus',
}: PhotoFocusPickerProps) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { height: screenHeight } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(0);
  const [loadedAspectRatio, setLoadedAspectRatio] = useState<number | null>(null);
  const photoAspectRatio = loadedAspectRatio ?? aspectRatio;
  // Until the photo has loaded, its box takes the card's shape.
  const boxAspectRatio = photoAspectRatio ?? tokens.photoCard.aspectRatio;
  const boxHeight = Math.min(
    availableWidth / boxAspectRatio,
    screenHeight * PICKER_MAX_SHARE_OF_SCREEN,
  );
  const boxWidth = boxHeight * boxAspectRatio;
  const shownFocus = resolvePhotoFocus(focus, photoAspectRatio);
  const window = photoCropWindow(shownFocus, boxAspectRatio, frameAspectRatio);

  const measureWidth = useCallback(
    (event: LayoutChangeEvent) => setAvailableWidth(event.nativeEvent.layout.width),
    [],
  );
  const measureShape = useCallback(({ source: loaded }: ImageLoadEventData) => {
    if (loaded.width > 0 && loaded.height > 0) setLoadedAspectRatio(loaded.width / loaded.height);
  }, []);
  const choose = useCallback(
    (x: number, y: number) => onChange(photoFocusFromPoint(x, y, boxWidth, boxHeight)),
    [boxHeight, boxWidth, onChange],
  );
  const touchDown = useCallback(() => playHaptic('selection'), []);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .minDistance(0)
        .onBegin((event) => {
          runOnJS(touchDown)();
          runOnJS(choose)(event.x, event.y);
        })
        .onUpdate((event) => {
          runOnJS(choose)(event.x, event.y);
        }),
    [choose, touchDown],
  );
  const moveByScreenReader = useCallback(
    (event: AccessibilityActionEvent) => {
      const step =
        event.nativeEvent.actionName === 'increment' ? SCREEN_READER_STEP : -SCREEN_READER_STEP;
      choose(shownFocus.x * boxWidth, (shownFocus.y + step) * boxHeight);
    },
    [boxHeight, boxWidth, choose, shownFocus.x, shownFocus.y],
  );
  const reset = useCallback(() => onChange(null), [onChange]);

  // A photo is never mirrored, so its box runs left to right in every
  // language, like the touch points: there, start is the photo's left edge.
  const boxStyle = useMemo<ViewStyle>(
    () => ({ ...continuousCorners, direction: 'ltr', width: boxWidth, height: boxHeight }),
    [boxHeight, boxWidth],
  );
  const imageStyle = useMemo<ImageStyle>(
    () => ({ width: boxWidth, height: boxHeight }),
    [boxHeight, boxWidth],
  );
  const frameStart = window.left * boxWidth;
  const frameTop = window.top * boxHeight;
  const frameWidth = window.width * boxWidth;
  const frameHeight = window.height * boxHeight;
  const shades = useMemo<readonly ViewStyle[]>(
    () => [
      { position: 'absolute', top: 0, start: 0, end: 0, height: frameTop },
      { position: 'absolute', top: frameTop + frameHeight, start: 0, end: 0, bottom: 0 },
      { position: 'absolute', top: frameTop, height: frameHeight, start: 0, width: frameStart },
      {
        position: 'absolute',
        top: frameTop,
        height: frameHeight,
        start: frameStart + frameWidth,
        end: 0,
      },
    ],
    [frameHeight, frameStart, frameTop, frameWidth],
  );
  const frameStyle = useMemo<ViewStyle>(
    () => ({
      position: 'absolute',
      start: frameStart,
      top: frameTop,
      width: frameWidth,
      height: frameHeight,
    }),
    [frameHeight, frameStart, frameTop, frameWidth],
  );

  return (
    <View testID={testID} className="gap-xs">
      <FieldLabel>{t('photoFocus.label')}</FieldLabel>
      <View onLayout={measureWidth} className="items-center">
        {availableWidth === 0 ? null : (
          <GestureDetector gesture={gesture}>
            <View
              testID={`${testID}-photo`}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={t('photoFocus.label')}
              accessibilityValue={{ text: `${Math.round(shownFocus.y * 100)}%` }}
              accessibilityActions={ACCESSIBILITY_ACTIONS}
              onAccessibilityAction={moveByScreenReader}
              className="overflow-hidden rounded-md bg-neutral-200"
              style={boxStyle}
            >
              <Image
                source={source}
                accessible={false}
                contentFit="contain"
                cachePolicy="memory-disk"
                onLoad={measureShape}
                style={imageStyle}
              />
              {/* Everything the card leaves out, dimmed; the card's frame over the rest. */}
              {shades.map((shade, index) => (
                <View key={index} pointerEvents="none" className="bg-black/50" style={shade} />
              ))}
              <View
                testID={`${testID}-frame`}
                pointerEvents="none"
                className="rounded-sm border-2 border-white"
                style={frameStyle}
              />
            </View>
          </GestureDetector>
        )}
      </View>
      {focus === null ? null : (
        <PressableScale
          testID={`${testID}-reset`}
          accessibilityRole="button"
          accessibilityLabel={t('photoFocus.reset')}
          onPress={reset}
          haptic="tapLight"
          className="min-h-recommended justify-center self-start"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>
            {t('photoFocus.reset')}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}
