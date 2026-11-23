/**
 * The story layout of a screen that opens on a photo (RAPP-915): the photo
 * runs from edge to edge and from the very top of the screen, under the
 * status bar, with the round back button floating on it. The content sits on
 * a sheet with large rounded top corners that overlaps the bottom of the
 * photo. A forum post, an avís, a guide, a story, a service and an opened
 * gallery photo all open this way when they have a photo; without one they
 * keep their own layout.
 *
 * The photo keeps its own shape, like a card photo (RAPP-914), and starts at
 * the shape the card already measured. A tall portrait photo stops at a share
 * of the screen's height and fits inside it, over a blurred copy of itself,
 * so nothing of it is cut and the top of the screen stays filled.
 *
 * The card that opened the screen grows its photo into this one on iOS
 * (RAPP-916): the photo alone is the zoom's target.
 *
 * `PhotoHeroScreen` is the whole scrolling screen. A screen that scrolls a
 * list of its own, such as a forum thread, puts `PhotoHero` at the top of its
 * list and passes `overPhoto` to its header itself.
 */
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { PhotoZoomTarget } from '@/components/media/photo-zoom';
import { continuousCorners } from '@/lib/continuous-corners';
import { useRememberedPhotoShape } from '@/lib/remembered-photo-shape';
import { Image, type ImageSource } from 'expo-image';
import { useMemo, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

/** The most of the screen's height the photo takes, so the title shows under it. */
const PHOTO_HERO_MAX_SHARE_OF_SCREEN = 0.6;
/** How soft the copy behind a tall photo is, enough to read as colour only. */
const BACKDROP_BLUR_RADIUS = tokens.spacing.xl;
const SHEET_CORNER_RADIUS = tokens.radius.xl;

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', backgroundColor: tokens.colors.neutral[900] },
  sheet: {
    ...continuousCorners,
    flexGrow: 1,
    marginTop: -SHEET_CORNER_RADIUS,
    paddingTop: tokens.spacing.lg,
    borderTopStartRadius: SHEET_CORNER_RADIUS,
    borderTopEndRadius: SHEET_CORNER_RADIUS,
  },
});
const photoFillStyle: ImageStyle = StyleSheet.absoluteFill;

export interface PhotoHeroProps {
  readonly source: ImageSource;
  /** The photo's stored key: the card that opened the screen measured its shape under it. */
  readonly photoKey: string;
  /** The photo's alt text. */
  readonly accessibilityLabel: string;
  /** Opens the photo at full screen, such as a gallery photo's lightbox (RAPP-913). */
  readonly onOpenPhoto?: () => void;
  /** The sheet's colour, such as the wash of the item's kind (RAPP-893); white by default. */
  readonly sheetColor?: string;
  readonly children: ReactNode;
}

function PhotoHeroPhoto({
  source,
  photoKey,
  accessibilityLabel,
  onOpenPhoto,
}: Omit<PhotoHeroProps, 'sheetColor' | 'children'>) {
  const { width, height: screenHeight } = useWindowDimensions();
  const { aspectRatio, rememberShape } = useRememberedPhotoShape(photoKey);
  const ownHeight = width / aspectRatio;
  const maxHeight = screenHeight * PHOTO_HERO_MAX_SHARE_OF_SCREEN;
  const isTall = ownHeight > maxHeight;
  const frameStyle = useMemo<ViewStyle>(
    () => ({ ...styles.frame, height: Math.min(ownHeight, maxHeight) }),
    [maxHeight, ownHeight],
  );
  const photo = (
    <>
      {isTall ? (
        <Image
          source={source}
          accessible={false}
          cachePolicy="memory-disk"
          contentFit="cover"
          blurRadius={BACKDROP_BLUR_RADIUS}
          style={photoFillStyle}
        />
      ) : null}
      {/* The photo of the card that opened the screen grows into this one (RAPP-916). */}
      <PhotoZoomTarget>
        <Image
          source={source}
          accessible={onOpenPhoto === undefined}
          accessibilityLabel={accessibilityLabel}
          cachePolicy="memory-disk"
          contentFit={isTall ? 'contain' : 'cover'}
          recyclingKey={photoKey}
          onLoad={rememberShape}
          // No fade of its own: a fade competing with the zoom reads as a web page.
          transition={0}
          style={photoFillStyle}
        />
      </PhotoZoomTarget>
    </>
  );
  if (onOpenPhoto === undefined) return <View style={frameStyle}>{photo}</View>;
  return (
    <Pressable
      testID="photo-hero-open"
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      onPress={onOpenPhoto}
      style={frameStyle}
    >
      {photo}
    </Pressable>
  );
}

/** The photo and the sheet over its bottom edge, with the screen's content on the sheet. */
export function PhotoHero({ sheetColor, children, ...photo }: PhotoHeroProps) {
  const sheetStyle = useMemo<ViewStyle>(
    () => ({ ...styles.sheet, backgroundColor: sheetColor ?? tokens.colors.white }),
    [sheetColor],
  );
  return (
    <View testID="photo-hero" className="grow">
      <PhotoHeroPhoto {...photo} />
      <View style={sheetStyle}>{children}</View>
    </View>
  );
}

/**
 * A whole screen in the story layout: the floating header, and the photo and
 * its sheet scrolling together. The content keeps the screen's side margins.
 */
export function PhotoHeroScreen({
  testID,
  hasBottomAction = false,
  sheetColor,
  children,
  ...photo
}: PhotoHeroProps & {
  readonly testID?: string;
  /** The screen keeps a call to action under the content, which already clears the home indicator. */
  readonly hasBottomAction?: boolean;
}) {
  const { bottom } = useSafeAreaInsets();
  const scrollStyle = useMemo<ViewStyle>(
    () => ({ flex: 1, backgroundColor: sheetColor ?? tokens.colors.white }),
    [sheetColor],
  );
  const contentStyle = useMemo<ViewStyle>(
    () => ({ flexGrow: 1, paddingBottom: (hasBottomAction ? 0 : bottom) + tokens.spacing.lg }),
    [bottom, hasBottomAction],
  );
  return (
    <>
      <NativeScreenHeader overPhoto />
      <ScrollView
        testID={testID}
        style={scrollStyle}
        contentContainerStyle={contentStyle}
        // The photo starts at the top of the screen, under the status bar.
        contentInsetAdjustmentBehavior="never"
      >
        <PhotoHero sheetColor={sheetColor} {...photo}>
          <View className="px-lg">{children}</View>
        </PhotoHero>
      </ScrollView>
    </>
  );
}
