import { describe, expect, test } from 'bun:test';

const motionPrimitiveFiles = [
  'fade-slide-in.tsx',
  'list-item-transition.tsx',
  'pressable-scale.tsx',
  'shake-on-error.tsx',
  'skeleton-pulse.tsx',
  'success-pop.tsx',
] as const;

describe('NativeWind animated view interop', () => {
  test('the interop wrapper is web-only and preserves native Animated.View', async () => {
    const source = await Bun.file(new URL('nativewind-animated-view.tsx', import.meta.url)).text();

    expect(source).toContain("Platform.OS === 'web'");
    expect(source).toContain(': Animated.View');
  });

  for (const fileName of motionPrimitiveFiles) {
    test(`${fileName} uses the shared NativeWind-aware animated view`, async () => {
      const source = await Bun.file(new URL(fileName, import.meta.url)).text();

      expect(source).toContain("from './nativewind-animated-view'");
      expect(source).not.toContain('<Animated.View');
    });
  }
});
