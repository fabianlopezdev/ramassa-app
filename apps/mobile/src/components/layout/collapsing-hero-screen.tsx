/**
 * A screen that opens on a large photo with a title on it, such as her photo
 * and her name on Les meves dades (RAPP-960). As she scrolls, the sheet rides
 * up over the photo and the photo shrinks with it, down to a band that keeps a
 * slice of the photo, the title and the back button; from there only the
 * content scrolls, under the band. Pulled down at the top, the photo stretches
 * and springs back.
 *
 * With no photo the top is a panel of colour holding `panel`, such as her
 * initials on the soft brand blue, which fade out as the panel collapses.
 *
 * `accessory` sits on the bottom end of the top, beside the title, such as the
 * pencil that changes her photo.
 */
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import {
  PHOTO_HERO_MAX_SHARE_OF_SCREEN,
  PHOTO_HERO_SHEET_RADIUS,
  PhotoHeroTitle,
} from '@/components/layout/photo-hero';
import { continuousCorners } from '@/lib/continuous-corners';
import { usePhotoFocusPosition } from '@/lib/photo-focus-position';
import { Image, type ImageSource } from 'expo-image';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PhotoFocus } from '@ramassa/shared/photo-focus';
import { tokens } from '@ramassa/shared/tokens';

/** The height of one line of the large title. */
const TITLE_LINE_HEIGHT = tokens.fontSize['3xl'] * 1.25;
/** A panel with no photo is at least as tall as a common landscape photo. */
const PANEL_ASPECT_RATIO = 4 / 3;
/** How much of the collapse it takes for the panel's content to fade out. */
const PANEL_FADE_SHARE = 0.6;

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, start: 0, end: 0, overflow: 'hidden' },
  cap: {
    ...continuousCorners,
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    height: PHOTO_HERO_SHEET_RADIUS,
    borderTopStartRadius: PHOTO_HERO_SHEET_RADIUS,
    borderTopEndRadius: PHOTO_HERO_SHEET_RADIUS,
  },
  accessory: {
    position: 'absolute',
    end: tokens.spacing.lg,
    bottom: PHOTO_HERO_SHEET_RADIUS + tokens.spacing.md,
  },
});

export interface CollapsingHeroPhoto {
  readonly source: ImageSource;
  /** The photo's stored key, so its shape is remembered between visits. */
  readonly photoKey: string;
  readonly focus: PhotoFocus | null;
  readonly accessibilityLabel: string;
}

export function CollapsingHeroScreen({
  testID,
  title,
  languageFontClass,
  photo,
  panelColor,
  panel,
  accessory,
  sheetColor = tokens.colors.white,
  hasBottomAction = false,
  children,
}: {
  readonly testID?: string;
  /** The screen's heading, on the bottom of the photo or panel. */
  readonly title: string;
  readonly languageFontClass: string;
  /** The photo, or null to show the panel. */
  readonly photo: CollapsingHeroPhoto | null;
  /** The panel's colour when there is no photo. */
  readonly panelColor: string;
  /** What the panel holds when there is no photo, such as her initials. */
  readonly panel?: ReactNode;
  readonly accessory?: ReactNode;
  readonly sheetColor?: string;
  /** The screen keeps a call to action under the content, which already clears the home indicator. */
  readonly hasBottomAction?: boolean;
  readonly children: ReactNode;
}) {
  const { width, height: screenHeight } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const { aspectRatio, contentPosition, rememberShape } = usePhotoFocusPosition(
    photo?.photoKey ?? '',
    photo?.focus ?? null,
  );

  // The band: the back button's row, one line of title, and the sheet's rounded top.
  const minHeight =
    topInset +
    tokens.tapTarget.min +
    tokens.spacing.sm +
    TITLE_LINE_HEIGHT +
    PHOTO_HERO_SHEET_RADIUS +
    tokens.spacing.md;
  const fullHeight = Math.max(
    minHeight + tokens.spacing['3xl'],
    photo === null
      ? width / PANEL_ASPECT_RATIO
      : Math.min(width / aspectRatio, screenHeight * PHOTO_HERO_MAX_SHARE_OF_SCREEN),
  );
  const collapse = fullHeight - minHeight;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  // Shrinks with the scroll down to the band, and grows when pulled down at the top.
  const topStyle = useAnimatedStyle(() => ({
    height: Math.max(minHeight, fullHeight - scrollY.get()),
  }));
  const panelFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.get(),
      [0, collapse * PANEL_FADE_SHARE],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const backgroundStyle = useMemo<ViewStyle>(
    () => ({
      backgroundColor: photo === null ? panelColor : tokens.colors.neutral[900],
    }),
    [panelColor, photo],
  );
  const capStyle = useMemo<ViewStyle>(
    () => ({ ...styles.cap, backgroundColor: sheetColor }),
    [sheetColor],
  );
  const panelStyle = useMemo<ViewStyle>(
    () => ({
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: topInset + tokens.tapTarget.min,
      paddingBottom: PHOTO_HERO_SHEET_RADIUS + tokens.spacing.md + TITLE_LINE_HEIGHT,
    }),
    [topInset],
  );
  const scrollStyle = useMemo<ViewStyle>(
    () => ({ flex: 1, backgroundColor: sheetColor }),
    [sheetColor],
  );
  const contentStyle = useMemo<ViewStyle>(
    () => ({
      paddingTop: fullHeight,
      paddingBottom: (hasBottomAction ? 0 : bottomInset) + tokens.spacing.lg,
      // Always room to collapse the top fully, however short the content.
      minHeight: screenHeight + collapse,
    }),
    [bottomInset, collapse, fullHeight, hasBottomAction, screenHeight],
  );

  return (
    <View testID={testID} style={scrollStyle}>
      <NativeScreenHeader overPhoto />
      <Animated.ScrollView
        testID={testID === undefined ? undefined : `${testID}-scroll`}
        style={scrollStyle}
        contentContainerStyle={contentStyle}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // The top starts at the very top of the screen, under the status bar.
        contentInsetAdjustmentBehavior="never"
      >
        <View className="px-lg">{children}</View>
      </Animated.ScrollView>
      {/* Above the content, which scrolls under the band. Touches on the
          photo fall through to the scroll, except on the accessory. */}
      <Animated.View
        testID="collapsing-hero-top"
        pointerEvents="box-none"
        style={[styles.top, backgroundStyle, topStyle]}
      >
        {photo === null ? (
          <Animated.View pointerEvents="none" style={[panelStyle, panelFadeStyle]}>
            {panel}
          </Animated.View>
        ) : (
          <Image
            source={photo.source}
            accessibilityLabel={photo.accessibilityLabel}
            cachePolicy="memory-disk"
            contentFit="cover"
            contentPosition={contentPosition}
            recyclingKey={photo.photoKey}
            onLoad={rememberShape}
            transition={0}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        )}
        <PhotoHeroTitle
          testID={testID === undefined ? undefined : `${testID}-title`}
          title={title}
          onPanel={photo === null}
          numberOfLines={1}
          reserveEnd={accessory !== undefined && accessory !== null}
          languageFontClass={languageFontClass}
        />
        <View pointerEvents="none" style={capStyle} />
        {accessory === undefined || accessory === null ? null : (
          <View style={styles.accessory}>{accessory}</View>
        )}
      </Animated.View>
    </View>
  );
}
