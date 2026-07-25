import { playHaptic } from '@/lib/haptics/haptics';
import { useEffect, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { resolveDurationMs, resolveSpring } from '@ramassa/shared/tokens/motion';

/**
 * The confirmation for a completed primary action (RAPP-70): signup, attendance
 * marked, message sent. A spring overshoot plus a success haptic, together,
 * because the two land as one event.
 *
 * Plays on MOUNT, so callers control it by rendering it (or by changing its
 * `key` to replay). That is deliberately not a `play` boolean: a prop that
 * triggers an animation has to be reset afterwards, and every caller forgets.
 * Conditional rendering has no such state to leak.
 *
 * Under reduce-motion the spring is critically damped and the duration is 0, so
 * the element appears without a bounce. The haptic still fires: reduce-motion is
 * about movement, not about removing confirmation, and the haptic kill switch
 * is separate.
 */
export interface SuccessPopProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Set false for a purely visual confirmation (e.g. inside a list). */
  readonly hasHaptic?: boolean;
}

export function SuccessPop({ children, className, hasHaptic = true }: SuccessPopProps) {
  const isReducedMotion = useReducedMotion();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  const spring = resolveSpring('snappy', isReducedMotion);
  const durationMs = resolveDurationMs('fast', isReducedMotion);

  useEffect(() => {
    if (hasHaptic) {
      playHaptic('success');
    }
    opacity.set(withTiming(1, { duration: durationMs }));
    // Undershoot then spring: the spring's own overshoot supplies the "pop",
    // so no magic scale value is needed at the peak.
    scale.set(withSequence(withTiming(0.85, { duration: durationMs }), withSpring(1, spring)));
  }, [scale, opacity, durationMs, spring, hasHaptic]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Animated.View style={animatedStyle} className={className}>
      {children}
    </Animated.View>
  );
}
