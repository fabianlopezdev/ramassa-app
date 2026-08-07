import { continuousCorners } from '@/lib/continuous-corners';
import { useEffect, useMemo } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { motionTokens, resolveDurationMs } from '@ramassa/shared/tokens/motion';
import { NativeWindAnimatedView } from './nativewind-animated-view';

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
const SKELETON_TIMING_CONFIG = { duration: motionTokens.duration.slow } as const;

function SkeletonPulseSurface({
  className,
  cornerStyle,
}: SkeletonPulseProps & { readonly cornerStyle: typeof continuousCorners | undefined }) {
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
        withTiming(motionTokens.skeleton.minOpacity, SKELETON_TIMING_CONFIG),
        PULSE_REPEAT_FOREVER,
        true,
      ),
    );
  }, [opacity, durationMs]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const composedStyle = useMemo(() => [animatedStyle, cornerStyle], [animatedStyle, cornerStyle]);

  return (
    <NativeWindAnimatedView
      accessible={false}
      // The rounded surface is this component's own, so the continuous curve
      // belongs here rather than at every call site (contract rule 17): callers
      // pass the radius as a class and NativeWind cannot express `borderCurve`.
      // Composed with the pulse, from the hoisted constant, never a literal.
      style={composedStyle}
      className={`bg-neutral-200 ${className ?? ''}`}
    />
  );
}

export function SkeletonPulse(props: SkeletonPulseProps) {
  return <SkeletonPulseSurface {...props} cornerStyle={continuousCorners} />;
}

/** Explicit pill variant: its full radius is already the intended geometry. */
export function CapsuleSkeletonPulse(props: SkeletonPulseProps) {
  return <SkeletonPulseSurface {...props} cornerStyle={undefined} />;
}
