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
    });
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
    expect(splash).toContain('onLayout={hideNativeSplash}');
  });

  test('reduce motion or a failed clip shows the last frame at once', async () => {
    const splash = await read('../components/branding/animated-splash.tsx');

    expect(splash).toContain('const settled = reduceMotion || hasError || clipEnded;');
    expect(splash).toContain('{settled ? (');
    expect(splash).toContain('if (reduceMotion || hasError || player.playing) return;');
  });

  test('it plays once on the phone, and the web hides the native splash on its own', async () => {
    const [splash, layout] = await Promise.all([
      read('../components/branding/animated-splash.tsx'),
      read('../app/_layout.tsx'),
    ]);

    expect(splash).toContain("if (Platform.OS === 'web' || shown) return null;");
    expect(splash).toContain('launchSplashShown = true;');
    expect(layout).toContain('<LaunchSplash appReady={!isLoading} />');
    expect(layout).toContain("if (Platform.OS === 'web' && !isLoading) {");
    expect(layout).toContain('void SplashScreen.preventAutoHideAsync();');
  });
});
