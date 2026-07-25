import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { motionTokens, resolveDurationMs } from '@ramassa/shared/tokens/motion';

/**
 * The loading placeholder (RAPP-70 + the SPEC "skeletons preferred over
 * spinners" rule). A skeleton says what is coming and keeps the layout stable;
 * a spinner says only "wait" and lets content jump in underneath it.
 *
 * Only `opacity` animates, so there is no layout cost per frame; the block's
 * size comes from the caller's NativeWind classes, which keeps the shape of the
 * skeleton a layout concern rather than an animation one.
 *
 * Under reduce-motion it holds a steady mid opacity instead of pulsing: still
 * visibly a placeholder, but not a repeating animation, which is the thing the
 * setting exists to stop.
 */
export interface SkeletonPulseProps {
  /** Size and radius come from here, e.g. "h-md w-full rounded-md". */
  readonly className?: string;
}

const PULSE_REPEAT_FOREVER = -1;

export function SkeletonPulse({ className }: SkeletonPulseProps) {
  const isReducedMotion = useReducedMotion();
  // Explicit `number`: the tokens are `as const`, so inference would pin this
  // shared value to the literal 1 and reject the pulse's min opacity.
  const opacity = useSharedValue<number>(motionTokens.skeleton.maxOpacity);

  const durationMs = resolveDurationMs('slow', isReducedMotion);

  useEffect(() => {
    if (durationMs === 0) {
      opacity.set(motionTokens.skeleton.minOpacity);
      return;
    }
    opacity.set(
      withRepeat(
        withTiming(motionTokens.skeleton.minOpacity, { duration: durationMs }),
        PULSE_REPEAT_FOREVER,
        true,
      ),
    );
  }, [opacity, durationMs]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={animatedStyle}
      className={`bg-neutral-200 ${className ?? ''}`}
    />
  );
}
