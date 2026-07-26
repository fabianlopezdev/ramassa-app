/**
 * Motion tokens (RAPP-70): the single source of truth for every duration, spring
 * and travel distance in the app, exactly as `tokens/index.ts` is for colour and
 * spacing. No component may write a raw millisecond value, the same law that
 * bans raw hex codes (ADR-015).
 *
 * Plain data on purpose: this module imports neither Reanimated nor React
 * Native, so the admin bundle can read the same numbers and nothing native
 * leaks into web. The Reanimated-shaped objects (`withTiming` configs,
 * `withSpring` configs) are assembled in the mobile primitives.
 *
 * Two constraints shape every value here (SPEC):
 *
 * 1. **Low-end Android is the primary device.** Durations stay short, and every
 *    primitive animates only `transform` and `opacity`, which the GPU handles
 *    without a layout pass.
 * 2. **Reduce-motion is a real setting, not a nicety.** It is honoured by the
 *    RESOLVERS below rather than by each component, so a primitive cannot
 *    forget: a component asks for `resolveDurationMs('base', isReduced)` and
 *    gets 0 when the user has asked for less motion. Movement disappears;
 *    opacity changes remain, because a state change still has to be visible.
 */

export const motionTokens = {
  /** Milliseconds. `fast` for press feedback, `base` for most, `slow` for entrances. */
  duration: { fast: 150, base: 250, slow: 400 },

  /** Reanimated `withSpring` configs, named so call sites never tune numbers. */
  spring: {
    /** Confirmations and press release: settles quickly, minimal overshoot. */
    snappy: { damping: 18, stiffness: 260, mass: 1 },
    /** Entrances and layout shifts: softer, slightly slower to settle. */
    gentle: { damping: 22, stiffness: 140, mass: 1 },
  },

  /** The press response every touchable shares. 0.97 reads as felt, not seen. */
  press: { scale: 0.97, opacity: 0.9 },

  /** Content entrance: a short rise plus a fade, staggered down a list. */
  entrance: {
    translateY: 12,
    staggerMs: 40,
    /** Ceiling on the stagger so a long list does not crawl in for seconds. */
    maxStaggerMs: 240,
  },

  /** Validation-error nudge, paired with the translated message, never alone. */
  shake: { offset: 8, cycles: 3 },

  /** Skeleton loaders pulse between these opacities (never a spinner). */
  skeleton: { minOpacity: 0.4, maxOpacity: 1 },
} as const;

export type MotionDurationName = keyof typeof motionTokens.duration;
export type MotionSpringName = keyof typeof motionTokens.spring;
export interface MotionSpringConfig {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
}

/** Zero when the user asked for reduced motion: the change lands instantly. */
export function resolveDurationMs(name: MotionDurationName, isReducedMotion: boolean): number {
  return isReducedMotion ? 0 : motionTokens.duration[name];
}

/** 1 (no shrink) under reduce-motion, rather than a smaller shrink. */
export function resolvePressScale(isReducedMotion: boolean): number {
  return isReducedMotion ? 1 : motionTokens.press.scale;
}

/** 0 under reduce-motion: content still fades in, but it does not travel. */
export function resolveEntranceTranslateY(isReducedMotion: boolean): number {
  return isReducedMotion ? 0 : motionTokens.entrance.translateY;
}

/** Per-item entrance delay, capped so late items are not left waiting. */
export function resolveStaggerMs(index: number, isReducedMotion: boolean): number {
  if (isReducedMotion) {
    return 0;
  }
  return Math.min(index * motionTokens.entrance.staggerMs, motionTokens.entrance.maxStaggerMs);
}

/** No movement at all under reduce-motion; the message still shows. */
export function resolveShake(isReducedMotion: boolean): { offset: number; cycles: number } {
  return isReducedMotion
    ? { offset: 0, cycles: 0 }
    : { offset: motionTokens.shake.offset, cycles: motionTokens.shake.cycles };
}

/**
 * Under reduce-motion a spring is made critically damped instead of being
 * replaced by a timing: it still settles, but it never oscillates, which is the
 * part of a spring that reads as "motion" to someone who asked for less of it.
 */
/**
 * Critically-damped variants, computed ONCE. A spring config is handed straight
 * to a `useEffect` dependency array, so it has to be referentially stable: when
 * the reduced branch built a fresh object per call, the effect re-ran on every
 * render and `SuccessPop` replayed its success haptic each time. Reduce-motion
 * users were the only ones affected, which is the wrong way round.
 */
const criticallyDampedSprings: Record<MotionSpringName, MotionSpringConfig> = Object.fromEntries(
  Object.entries(motionTokens.spring).map(([name, spring]) => [
    name,
    { ...spring, damping: 2 * Math.sqrt(spring.stiffness * spring.mass) },
  ]),
) as Record<MotionSpringName, MotionSpringConfig>;

export function resolveSpring(
  name: MotionSpringName,
  isReducedMotion: boolean,
): MotionSpringConfig {
  return isReducedMotion ? criticallyDampedSprings[name] : motionTokens.spring[name];
}
