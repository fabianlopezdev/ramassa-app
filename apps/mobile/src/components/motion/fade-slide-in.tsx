import { useEffect, useState, type ReactNode } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  motionTokens,
  resolveDurationMs,
  resolveEntranceTranslateY,
  resolveStaggerMs,
} from '@ramassa/shared/tokens/motion';
import { NativeWindAnimatedView } from './nativewind-animated-view';

/**
 * Content entrance (RAPP-70): a short rise plus a fade, staggered down a list.
 *
 * Runs once after layout and content readiness, never on ordinary re-render. That distinction matters: an
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
  readonly preset?: 'default' | 'onboarding' | 'logo' | 'fade';
  /** Wait for async content, such as a downloaded logo, before starting. */
  readonly ready?: boolean;
}

export function FadeSlideIn({
  children,
  index = 0,
  className,
  preset = 'default',
  ready = true,
}: FadeSlideInProps) {
  const isReducedMotion = useReducedMotion();
  const progress = useSharedValue(isReducedMotion ? 1 : 0);

  const [laidOut, setLaidOut] = useState(false);
  const entrance = motionTokens.onboardingEntrance;
  const travel = isReducedMotion
    ? 0
    : preset === 'onboarding'
      ? entrance.translateY
      : preset === 'default'
        ? resolveEntranceTranslateY(false)
        : 0;
  const durationMs = isReducedMotion
    ? 0
    : preset === 'default'
      ? resolveDurationMs('slow', false)
      : preset === 'logo'
        ? motionTokens.logoEntrance.durationMs
        : entrance.durationMs;
  const delayMs = isReducedMotion
    ? 0
    : preset === 'onboarding'
      ? entrance.leadInMs + Math.min(index * entrance.staggerMs, entrance.maxStaggerMs)
      : preset === 'default'
        ? resolveStaggerMs(index, false)
        : 0;

  useEffect(() => {
    if (!ready || !laidOut) return;
    progress.set(
      withDelay(
        delayMs,
        withTiming(1, {
          duration: durationMs,
          easing: preset === 'default' ? Easing.inOut(Easing.quad) : Easing.out(Easing.cubic),
        }),
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, delayMs, durationMs, preset, ready, laidOut]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * travel }],
  }));

  return (
    <NativeWindAnimatedView
      style={animatedStyle}
      className={className}
      onLayout={() => setLaidOut(true)}
    >
      {children}
    </NativeWindAnimatedView>
  );
}
