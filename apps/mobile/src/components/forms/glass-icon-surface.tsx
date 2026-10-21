import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const circleStyle = {
  width: tokens.tapTarget.min,
  height: tokens.tapTarget.min,
  borderRadius: tokens.tapTarget.min / 2,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/** One circular surface for back and edit icons, with a matching non-glass fallback. */
export function GlassIconSurface({ children }: { readonly children: ReactNode }) {
  const hasNativeGlass =
    process.env.EXPO_OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  return hasNativeGlass ? (
    <GlassView
      style={circleStyle}
      glassEffectStyle="regular"
      colorScheme="light"
      isInteractive
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </GlassView>
  ) : (
    <View
      style={circleStyle}
      className="border border-neutral-200 bg-white/80 shadow-sm"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}
