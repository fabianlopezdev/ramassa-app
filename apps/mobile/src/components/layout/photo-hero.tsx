/**
 * The story layout of a screen that opens on a photo (RAPP-915): the photo
 * runs from edge to edge and from the very top of the screen, under the
 * status bar, with the round back button floating on it. The content sits on
 * a sheet with large rounded top corners that overlaps the bottom of the
 * photo. A forum post, an avís, a guide, a story and a service all open this
 * way when they have a photo; without one they keep their own layout. A
 * gallery photo opens in the lightbox instead (RAPP-931).
 *
 * The photo keeps its own shape, like a card photo (RAPP-914), and starts at
 * the shape the card already measured. A tall portrait photo stops at a share
 * of the screen's height and fits inside it, over a blurred copy of itself,
 * so nothing of it is cut and the top of the screen stays filled.
 *
 * Until its shape is known the photo is cropped, around the focus its
 * uploader chose or the default for its shape (RAPP-932).
 *
 * The card that opened the screen grows its photo into this one on iOS
 * (RAPP-916): the photo alone is the zoom's target.
 *
 * `PhotoHeroScreen` is the whole scrolling screen. A screen that scrolls a
 * list of its own, such as a forum thread, puts `PhotoHero` at the top of its
 * list and passes `overPhoto` to its header itself.
 *
 * A screen may put a title on the bottom of the photo through `overlay`, with
 * `PhotoHeroTitle`, such as her name on her profile (RAPP-960). With no photo,
 * `PanelHeroScreen` keeps the same layout over a coloured panel of a wide
 * photo's height, such as her initials on the soft brand blue.
 */
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { PhotoZoomTarget } from '@/components/media/photo-zoom';
import { continuousCorners } from '@/lib/continuous-corners';
import { usePhotoFocusPosition } from '@/lib/photo-focus-position';
import { Image, type ImageSource } from 'expo-image';
import { useMemo, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PhotoFocus } from '@ramassa/shared/photo-focus';
import { tokens } from '@ramassa/shared/tokens';

/** The most of the screen's height the photo takes, so the title shows under it. */
const PHOTO_HERO_MAX_SHARE_OF_SCREEN = 0.6;
/** How soft the copy behind a tall photo is, enough to read as colour only. */
const BACKDROP_BLUR_RADIUS = tokens.spacing.xl;
const SHEET_CORNER_RADIUS = tokens.radius.xl;
/** A panel with no photo is at least as tall as a common landscape photo. */
const PANEL_HERO_ASPECT_RATIO = 4 / 3;

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

// A title on the photo sits on a dark fade, so white type reads on any picture,
// and clears the sheet's rounded corners that overlap the photo's bottom edge.
const titleOnPhotoStyle: ViewStyle = {
  position: 'absolute',
  start: 0,
  end: 0,
  bottom: 0,
  paddingHorizontal: tokens.spacing.lg,
  paddingTop: tokens.spacing['2xl'],
  paddingBottom: SHEET_CORNER_RADIUS + tokens.spacing.md,
  backgroundImage: `linear-gradient(to bottom, ${tokens.colors.black}00, ${tokens.colors.black}99)`,
};
// On a panel the title follows the panel's content, so the two never overlap.
const titleOnPanelStyle: ViewStyle = {
  alignSelf: 'stretch',
  paddingHorizontal: tokens.spacing.lg,
  paddingTop: tokens.spacing.lg,
  paddingBottom: SHEET_CORNER_RADIUS + tokens.spacing.md,
};

export interface PhotoHeroProps {
  readonly source: ImageSource;
  /** The photo's stored key: the card that opened the screen measured its shape under it. */
  readonly photoKey: string;
  /** The part of the photo to keep while it is cropped; null keeps the default crop. */
  readonly focus: PhotoFocus | null;
  /** The photo's alt text. */
  readonly accessibilityLabel: string;
  /** Opens the photo at full screen, such as a gallery photo's lightbox (RAPP-913). */
  readonly onOpenPhoto?: () => void;
  /** The sheet's colour, such as the wash of the item's kind (RAPP-893); white by default. */
  readonly sheetColor?: string;
  /** Drawn over the bottom of the photo, such as a `PhotoHeroTitle` (RAPP-960). */
  readonly overlay?: ReactNode;
  readonly children: ReactNode;
}

/**
 * A large title on the bottom of the photo or panel (RAPP-960): white on a dark
 * fade over a photo, the brand colour on a panel. It is the screen's heading.
 */
export function PhotoHeroTitle({
  title,
  onPanel = false,
  languageFontClass = '',
  testID,
}: {
  readonly title: string;
  readonly onPanel?: boolean;
  readonly languageFontClass?: string;
  readonly testID?: string;
}) {
  return (
    <View pointerEvents="none" style={onPanel ? titleOnPanelStyle : titleOnPhotoStyle}>
      <Text
        testID={testID}
        accessibilityRole="header"
        numberOfLines={2}
        className={`text-3xl font-bold ${onPanel ? 'text-primary' : 'text-white'} ${languageFontClass}`}
      >
        {title}
      </Text>
    </View>
  );
}

function PhotoHeroPhoto({
  source,
  photoKey,
  focus,
  accessibilityLabel,
  onOpenPhoto,
  overlay,
}: Omit<PhotoHeroProps, 'sheetColor' | 'children'>) {
  const { width, height: screenHeight } = useWindowDimensions();
  const { aspectRatio, contentPosition, rememberShape } = usePhotoFocusPosition(photoKey, focus);
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
          contentPosition={contentPosition}
          recyclingKey={photoKey}
          onLoad={rememberShape}
          // No fade of its own: a fade competing with the zoom reads as a web page.
          transition={0}
          style={photoFillStyle}
        />
      </PhotoZoomTarget>
      {overlay}
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

/** The floating header over the scrolling top and sheet, shared by both hero screens. */
function HeroScreenScroll({
  testID,
  hasBottomAction,
  sheetColor,
  children,
}: {
  readonly testID?: string;
  readonly hasBottomAction: boolean;
  readonly sheetColor?: string;
  readonly children: ReactNode;
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
        {children}
      </ScrollView>
    </>
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
  return (
    <HeroScreenScroll testID={testID} hasBottomAction={hasBottomAction} sheetColor={sheetColor}>
      <PhotoHero sheetColor={sheetColor} {...photo}>
        <View className="px-lg">{children}</View>
      </PhotoHero>
    </HeroScreenScroll>
  );
}

/**
 * The same screen with no photo (RAPP-960): a panel in `panelColor`, at least a
 * wide photo's height, holding `panel` under the floating back button and
 * `overlay` (a `PhotoHeroTitle` with `onPanel`) under it, then the same sheet.
 */
export function PanelHeroScreen({
  testID,
  panelColor,
  panel,
  overlay,
  sheetColor,
  children,
}: {
  readonly testID?: string;
  readonly panelColor: string;
  readonly panel: ReactNode;
  readonly overlay?: ReactNode;
  readonly sheetColor?: string;
  readonly children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const panelStyle = useMemo<ViewStyle>(
    () => ({
      width: '100%',
      minHeight: width / PANEL_HERO_ASPECT_RATIO + SHEET_CORNER_RADIUS,
      alignItems: 'center',
      justifyContent: 'flex-end',
      // Clear of the status bar and the floating back button.
      paddingTop: top + tokens.tapTarget.min + tokens.spacing.md,
      backgroundColor: panelColor,
    }),
    [panelColor, top, width],
  );
  const sheetStyle = useMemo<ViewStyle>(
    () => ({ ...styles.sheet, backgroundColor: sheetColor ?? tokens.colors.white }),
    [sheetColor],
  );
  return (
    <HeroScreenScroll testID={testID} hasBottomAction={false} sheetColor={sheetColor}>
      <View testID="panel-hero" className="grow">
        <View style={panelStyle}>
          {panel}
          {overlay}
        </View>
        <View style={sheetStyle}>
          <View className="px-lg">{children}</View>
        </View>
      </View>
    </HeroScreenScroll>
  );
}
