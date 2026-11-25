import { describe, expect, test } from 'bun:test';
import { tokens } from '@ramassa/shared/tokens';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('the launch splash: the shield builds itself (RAPP-955)', () => {
  test('the native splash draws the first frame on the soft blue, at the overlay size', async () => {
    const appJson = (await Bun.file(new URL('../../app.json', import.meta.url)).json()) as {
      expo: { plugins: unknown[] };
    };
    const splash = appJson.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );

    expect(splash?.[1]).toEqual({
      backgroundColor: tokens.splash.backgroundColor,
      image: './assets/images/splash-shield-start.png',
      imageWidth: tokens.splash.size,
      // Android shows the image in a circle 192 dp across, so it draws smaller.
      android: { imageWidth: tokens.splash.androidSize },
    });
    // The shield reaches 0.507 of the image width from its centre: on Android
    // it stays inside the 96 dp radius of the visible circle.
    expect(tokens.splash.androidSize * 0.507).toBeLessThan(96);
    // The same blue as the app icon's tile (RAPP-948).
    expect(tokens.splash.backgroundColor).toBe('#DBE0E9');
  });

  test('the overlay shows the first frame, the clip and the held last frame in one square', async () => {
    const splash = await read('../components/branding/animated-splash.tsx');

    expect(splash).toContain("from '@/assets/images/splash-shield-start.png'");
    expect(splash).toContain("from '@/assets/videos/splash-shield-build.mp4'");
    expect(splash).toContain("from '@/assets/images/splash-shield-end.png'");
    expect(splash).toContain('square: { width: size, height: size }');
    expect(splash.match(/contentFit="contain"/g)).toHaveLength(3);
    expect(splash).toContain('instance.muted = true');
    expect(splash).toContain('instance.loop = false');
    // The native splash goes once the shield's first frame is drawn, never before.
    expect(splash).toContain('onDisplay={hideNativeSplash}');
    expect(splash).toContain('setTimeout(hideNativeSplash, nativeHandOffMaxMs)');
    expect(splash).not.toContain('onLayout={hideNativeSplash}');
    // The clip layer stays hidden until it has drawn its own first frame.
    expect(splash).toContain('style={clipShown ? styles.layer : styles.hiddenLayer}');
    expect(splash).toContain('onFirstFrameRender={showClip}');
  });

  test('reduce motion or a failed clip shows the last frame at once', async () => {
    const splash = await read('../components/branding/animated-splash.tsx');

    expect(splash).toContain('const settled = reduceMotion || hasError || clipEnded;');
    expect(splash).toContain('style={settled ? styles.layer : styles.hiddenLayer}');
    expect(splash).toContain('{settled ? null : (');
    expect(splash).toContain('if (reduceMotion || hasError || player.playing) return;');
  });

  test('the last frame is loaded from the start, so the shield never flashes back to empty', async () => {
    const splash = await read('../components/branding/animated-splash.tsx');

    // Mounted from the first render, hidden until the clip ends (RAPP-955 follow-up).
    expect(splash).toContain('hiddenLayer: { ...StyleSheet.absoluteFill, opacity: 0 }');
    expect(splash).not.toContain('{settled ? (\n          <Image source={splashEnd}');
  });

  test('it plays once on the phone, and the web hides the native splash on its own', async () => {
    const [splash, layout, state] = await Promise.all([
      read('../components/branding/animated-splash.tsx'),
      read('../app/_layout.tsx'),
      read('./launch-splash-state.ts'),
    ]);

    expect(splash).toContain('if (done) return null;');
    expect(splash).toContain('onFinish={markLaunchSplashDone}');
    expect(state).toContain("let done = Platform.OS === 'web';");
    expect(layout).toContain('<LaunchSplash appReady={!isLoading} />');
    expect(layout).toContain("if (Platform.OS === 'web' && !isLoading) {");
    expect(layout).toContain('void SplashScreen.preventAutoHideAsync();');
  });

  test('the notifications question waits until the splash has gone (RAPP-955)', async () => {
    const appLayout = await read('../app/(app)/_layout.tsx');

    // It is a Modal, which draws over every view, the splash included.
    expect(appLayout).toContain('const launchSplashDone = useLaunchSplashDone();');
    expect(appLayout).toContain('canPrompt && launchSplashDone,');
  });
});
