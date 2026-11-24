/**
 * The launch splash (RAPP-955): the club shield builds itself on the soft
 * brand blue, then the splash fades into the app. It plays once per cold
 * start, over everything, on the phone only.
 *
 * The native splash draws the clip's first frame as a centred square of
 * `tokens.splash.size` on the same blue. This overlay draws that frame, the
 * clip and its held last frame in a square of the same size and place, so the
 * swap from the native splash is invisible on iPhone and Android alike. The
 * native splash is hidden once the overlay has laid out over it.
 *
 * Reduce motion, or a clip that fails to play, shows the last frame at once.
 * The splash stays at least `minDisplayMs`, leaves when the clip has ended and
 * the app is ready, and leaves after `maxDisplayMs` whatever happens, so a
 * stalled clip never holds the app back.
 */
import splashEnd from '@/assets/images/splash-shield-end.png';
import splashStart from '@/assets/images/splash-shield-start.png';
import splashClip from '@/assets/videos/splash-shield-build.mp4';
import { markLaunchSplashDone, useLaunchSplashDone } from '@/lib/launch-splash-state';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useVideoPlayer, VideoView, type SurfaceType } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '@ramassa/shared/tokens';

const { backgroundColor, size, fadeMs, minDisplayMs, maxDisplayMs } = tokens.splash;

// On Android a SurfaceView can draw above the views around it while the
// overlay fades; a TextureView fades with them (expo-video `surfaceType`).
const DECORATIVE_VIDEO_SURFACE: SurfaceType | undefined =
  Platform.OS === 'android' ? 'textureView' : undefined;

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor,
  },
  square: { width: size, height: size },
  layer: { ...StyleSheet.absoluteFill },
  hiddenLayer: { ...StyleSheet.absoluteFill, opacity: 0 },
});

export function AnimatedSplash({
  appReady,
  onFinish,
}: {
  /** True once the app below can be shown (the stored session has resolved). */
  readonly appReady: boolean;
  readonly onFinish: () => void;
}) {
  const { t } = useTranslation('common');
  const reduceMotion = useReducedMotion();
  const player = useVideoPlayer(splashClip, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const hasError = status === 'error';
  const [clipEnded, setClipEnded] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const hidNativeSplash = useRef(false);
  const leaving = useRef(false);
  const opacity = useSharedValue(1);

  // play() before the native player is ready does nothing, so it is tried
  // again each time the status changes.
  useEffect(() => {
    if (reduceMotion || hasError || player.playing) return;
    player.play();
  }, [hasError, player, reduceMotion, status]);

  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => setClipEnded(true));
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), minDisplayMs);
    const maxTimer = setTimeout(() => setTimedOut(true), maxDisplayMs);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  const hideNativeSplash = useCallback(() => {
    if (hidNativeSplash.current) return;
    hidNativeSplash.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const settled = reduceMotion || hasError || clipEnded;
  const ready = timedOut || (appReady && minElapsed && settled);

  useEffect(() => {
    if (!ready || leaving.current) return;
    leaving.current = true;
    opacity.set(
      withTiming(0, { duration: fadeMs, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );
  }, [onFinish, opacity, ready]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      testID="animated-splash"
      style={[styles.root, fadeStyle]}
      onLayout={hideNativeSplash}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('appName')}
    >
      <View style={styles.square}>
        {/* The first frame under the clip, so nothing blinks before it draws. */}
        <Image source={splashStart} contentFit="contain" accessible={false} style={styles.layer} />
        {/* The last frame loads with the first and waits hidden, so when the clip
            ends it is already drawn: the shield never flashes back to empty. */}
        <Image
          source={splashEnd}
          contentFit="contain"
          accessible={false}
          style={settled ? styles.layer : styles.hiddenLayer}
        />
        {settled ? null : (
          <VideoView
            player={player}
            contentFit="contain"
            nativeControls={false}
            surfaceType={DECORATIVE_VIDEO_SURFACE}
            accessible={false}
            style={styles.layer}
          />
        )}
      </View>
    </Animated.View>
  );
}

/**
 * The launch splash once per cold start, on the phone (RAPP-955). Once it has
 * faded out it stays done for the run, so the app mounted again for the player
 * preview (RAPP-371) does not play it a second time; the web build has no
 * launch splash and shows the app as soon as it is ready.
 */
export function LaunchSplash({ appReady }: { readonly appReady: boolean }) {
  const done = useLaunchSplashDone();
  if (done) return null;
  return <AnimatedSplash appReady={appReady} onFinish={markLaunchSplashDone} />;
}
