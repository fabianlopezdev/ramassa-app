import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '@ramassa/shared/tokens';
import { motionTokens } from '@ramassa/shared/tokens/motion';
import { NativeWindAnimatedView } from './nativewind-animated-view';

const geometry = tokens.checkmark;
const frameStyle = {
  width: geometry.size,
  height: geometry.size,
  direction: 'ltr',
  flexShrink: 0,
} as const;
const strokeStyle = {
  position: 'absolute',
  height: geometry.strokeWidth,
  borderRadius: geometry.strokeWidth,
  transformOrigin: 'left center',
} as const;
const shortStyle = {
  ...strokeStyle,
  start: geometry.short.x,
  top: geometry.short.y - geometry.strokeWidth / 2,
  width: geometry.short.length,
} as const;
const longStyle = {
  ...strokeStyle,
  start: geometry.long.x,
  top: geometry.long.y - geometry.strokeWidth / 2,
  width: geometry.long.length,
} as const;

/** Draws two rounded strokes using only transforms. The radio supplies the accessible state. */
export function DrawnCheckmark({ active }: { readonly active: boolean }) {
  const reduced = useReducedMotion();
  const previous = useRef(active);
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    if (previous.current === active) return;
    previous.current = active;
    cancelAnimation(progress);
    progress.set(
      reduced
        ? active
          ? 1
          : 0
        : withTiming(active ? 1 : 0, {
            duration: active ? motionTokens.checkDraw.durationMs : motionTokens.duration.fast,
            easing: Easing.linear,
          }),
    );
  }, [active, reduced, progress]);
  useEffect(() => () => cancelAnimation(progress), [progress]);
  const fraction = motionTokens.checkDraw.shortStrokeFraction;
  const shortAnimated = useAnimatedStyle(() => ({
    transform: [
      { rotate: geometry.short.angle },
      { scaleX: Math.min(1, Math.max(0, progress.get() / fraction)) },
    ],
  }));
  const longAnimated = useAnimatedStyle(() => ({
    transform: [
      { rotate: geometry.long.angle },
      { scaleX: Math.min(1, Math.max(0, (progress.get() - fraction) / (1 - fraction))) },
    ],
  }));
  return (
    <View
      style={frameStyle}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <NativeWindAnimatedView className="bg-primary" style={[shortStyle, shortAnimated]} />
      <NativeWindAnimatedView className="bg-primary" style={[longStyle, longAnimated]} />
    </View>
  );
}
