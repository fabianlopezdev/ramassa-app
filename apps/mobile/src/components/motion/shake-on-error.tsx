import { playErrorHaptic } from '@/lib/haptics/haptics';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { resolveDurationMs, resolveShake } from '@ramassa/shared/tokens/motion';
import { NativeWindAnimatedView } from './nativewind-animated-view';

/**
 * The validation-error nudge (RAPP-70), paired with a warning haptic. NEVER the
 * only signal: the translated message stays the primary one, because a shake
 * communicates nothing to someone who cannot see it and nothing specific to
 * anyone. This is emphasis on an error, not the error itself.
 *
 * Driven by `errorCode`: it shakes when the code CHANGES to a non-null value,
 * so submitting the same invalid form twice shakes twice, while a re-render
 * with the same error does not. That is why the previous code is tracked in a
 * ref rather than comparing against a boolean.
 *
 * The haptic is routed through the RAPP-12 taxonomy, so a wrong password warns
 * and a network failure errors, from the same component.
 *
 * Under reduce-motion the offset resolves to 0: no movement, message and haptic
 * unchanged.
 */
export interface ShakeOnErrorProps {
  readonly children: ReactNode;
  /** The current error, or null when the field is valid. */
  readonly errorCode: AppErrorCode | null;
  readonly className?: string;
}

export function ShakeOnError({ children, errorCode, className }: ShakeOnErrorProps) {
  const isReducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const previousErrorCodeRef = useRef<AppErrorCode | null>(null);

  const { offset, cycles } = resolveShake(isReducedMotion);
  const durationMs = resolveDurationMs('fast', isReducedMotion);
  const stepMs = Math.round(durationMs / 3);

  useEffect(() => {
    const hasNewError = errorCode !== null && errorCode !== previousErrorCodeRef.current;
    previousErrorCodeRef.current = errorCode;
    if (!hasNewError) {
      return;
    }

    playErrorHaptic(errorCode);

    if (offset === 0) {
      return;
    }
    const swings = Array.from({ length: cycles }, (_unused, cycleIndex) =>
      withTiming(cycleIndex % 2 === 0 ? -offset : offset, { duration: stepMs }),
    );
    translateX.set(withSequence(...swings, withTiming(0, { duration: stepMs })));
  }, [errorCode, translateX, offset, cycles, stepMs]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <NativeWindAnimatedView style={animatedStyle} className={className}>
      {children}
    </NativeWindAnimatedView>
  );
}
