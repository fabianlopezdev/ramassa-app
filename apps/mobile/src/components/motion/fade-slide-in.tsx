import { useEffect, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  resolveDurationMs,
  resolveEntranceTranslateY,
  resolveStaggerMs,
} from '@ramassa/shared/tokens/motion';

/**
 * Content entrance (RAPP-70): a short rise plus a fade, staggered down a list.
 *
 * Runs ONCE, on mount, never on re-render. That distinction matters: an
 * entrance that replays whenever its parent re-renders reads as flicker, and on
 * a feed that refetches it looks like a bug. The effect depends only on values
 * that are fixed for the component's life.
 *
 * `index` staggers items so a list assembles instead of appearing as a slab.
 * The stagger is capped in the tokens, so item 200 does not wait seconds.
 *
 * Under reduce-motion the travel distance and the delay both resolve to 0 and
 * the duration to 0, so content simply IS there: no movement, no waiting.
 */
export interface FadeSlideInProps {
  readonly children: ReactNode;
  /** Position in a list; drives the stagger. Omit for a single element. */
  readonly index?: number;
  readonly className?: string;
}

export function FadeSlideIn({ children, index = 0, className }: FadeSlideInProps) {
  const isReducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const travel = resolveEntranceTranslateY(isReducedMotion);
  const durationMs = resolveDurationMs('slow', isReducedMotion);
  const delayMs = resolveStaggerMs(index, isReducedMotion);

  useEffect(() => {
    progress.set(withDelay(delayMs, withTiming(1, { duration: durationMs })));
    // Mount-only by construction: every dependency is fixed for this instance's
    // life, so this cannot re-fire on a parent re-render.
  }, [progress, delayMs, durationMs]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * travel }],
  }));

  return (
    <Animated.View style={animatedStyle} className={className}>
      {children}
    </Animated.View>
  );
}
