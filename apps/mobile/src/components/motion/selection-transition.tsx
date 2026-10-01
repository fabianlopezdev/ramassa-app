import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { motionTokens, resolveDurationMs } from '@ramassa/shared/tokens/motion';
import { NativeWindAnimatedView } from './nativewind-animated-view';

/** Shared opacity transition, with an optional small confirmation settle.
 * Keeps children mounted so selection never changes their measured layout.
 * https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/
 */
export function SelectionTransition({
  active,
  emphasis = false,
  children,
  className,
  style,
}: {
  readonly active: boolean;
  readonly emphasis?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const previous = useRef(active);
  const opacity = useSharedValue(active ? 1 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (previous.current === active) return;
    previous.current = active;
    cancelAnimation(opacity);
    cancelAnimation(scale);
    if (reduced) {
      opacity.set(active ? 1 : 0);
      scale.set(1);
      return;
    }
    opacity.set(withTiming(active ? 1 : 0, { duration: resolveDurationMs('fast', false) }));
    if (active && emphasis) {
      const motion = motionTokens.selection;
      scale.set(motion.initialScale);
      scale.set(
        withSequence(
          withTiming(motion.peakScale, {
            duration: motion.riseMs,
            easing: Easing.out(Easing.cubic),
          }),
          withTiming(1, { duration: motion.settleMs, easing: Easing.out(Easing.cubic) }),
        ),
      );
    } else {
      scale.set(withTiming(1, { duration: resolveDurationMs('fast', false) }));
    }
  }, [active, emphasis, reduced, opacity, scale]);

  useEffect(
    () => () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    },
    [opacity, scale],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  const composedStyle = useMemo(() => [style, animatedStyle], [style, animatedStyle]);
  return (
    <NativeWindAnimatedView
      pointerEvents="none"
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      className={className}
      style={composedStyle}
    >
      {children}
    </NativeWindAnimatedView>
  );
}
