import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  motionTokens,
  resolveEntranceTranslateY,
  resolveStaggerMs,
} from '@ramassa/shared/tokens/motion';
import { NativeWindAnimatedView } from './nativewind-animated-view';

/**
 * Content entrance (RAPP-70): a rise plus a fade, staggered from block to block.
 * It is the one entrance of the app (RAPP-875): onboarding and every other
 * screen use the same distance, length and rhythm.
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
  /** `logo` and `fade` only fade: an image and a heading that must not travel. */
  readonly preset?: 'default' | 'logo' | 'fade';
  /** Wait for async content, such as a downloaded logo, before starting. */
  readonly ready?: boolean;
  /** Show the content at once: a screen she has already seen, or one whose blocks move themselves. */
  readonly skip?: boolean;
  /** Fade overlapping faces/shadows as one image, rather than blending each child. */
  readonly composite?: boolean;
}

interface EntranceOptions {
  readonly index?: number;
  readonly preset?: FadeSlideInProps['preset'];
  readonly ready?: boolean;
  readonly skip?: boolean;
  /** Learn when the entrance is over, at the cost of one more render. */
  readonly watchFinish?: boolean;
  /**
   * It continues a move that just ended, such as a card's photo landing at the
   * top of a screen (RAPP-920), so it starts at once with no lead-in.
   */
  readonly continuesMove?: boolean;
}

/**
 * The entrance itself, without a view: a value that goes from 0 to 1 once and
 * the distance to travel. `FadeSlideIn` draws one block with it; a whole
 * screen shares one value among its parts (`ScreenEntrance`).
 */
export function useEntrance({
  index = 0,
  preset = 'default',
  ready = true,
  skip = false,
  watchFinish = false,
  continuesMove = false,
}: EntranceOptions) {
  const isReducedMotion = useReducedMotion();
  const progress = useSharedValue(isReducedMotion || skip ? 1 : 0);

  const [laidOut, setLaidOut] = useState(false);
  const [finished, setFinished] = useState(false);
  const entrance = motionTokens.entrance;
  const travel = preset === 'default' ? resolveEntranceTranslateY(isReducedMotion) : 0;
  const durationMs = isReducedMotion
    ? 0
    : preset === 'logo'
      ? motionTokens.logoEntrance.durationMs
      : entrance.durationMs;
  const delayMs =
    isReducedMotion || preset !== 'default' || continuesMove
      ? 0
      : entrance.leadInMs + resolveStaggerMs(index, false);

  useEffect(() => {
    if (skip) {
      cancelAnimation(progress);
      progress.set(1);
      return;
    }
    if (!ready || !laidOut) return;
    progress.set(
      withDelay(
        delayMs,
        withTiming(1, { duration: durationMs, easing: Easing.out(Easing.cubic) }, (completed) => {
          if (completed && watchFinish) runOnJS(setFinished)(true);
        }),
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, delayMs, durationMs, ready, laidOut, watchFinish, skip]);

  const onLayout = useCallback(() => setLaidOut(true), []);
  const isMoving = !isReducedMotion && !skip && !finished;
  return { progress, travel, isMoving, onLayout };
}

export function FadeSlideIn({
  children,
  index,
  className,
  preset,
  ready,
  skip,
  composite = false,
}: FadeSlideInProps) {
  const { progress, travel, isMoving, onLayout } = useEntrance({
    index,
    preset,
    ready,
    skip,
    watchFinish: composite,
  });
  const cacheComposite = composite && isMoving;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * travel }],
  }));

  return (
    <NativeWindAnimatedView
      style={animatedStyle}
      className={className}
      needsOffscreenAlphaCompositing={cacheComposite}
      renderToHardwareTextureAndroid={cacheComposite}
      shouldRasterizeIOS={cacheComposite}
      onLayout={onLayout}
    >
      {children}
    </NativeWindAnimatedView>
  );
}
