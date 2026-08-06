import type { HapticFeedback } from '@/lib/haptics/haptic-policy';
import { playHaptic } from '@/lib/haptics/haptics';
import { cssInterop } from 'nativewind';
import type { ReactNode } from 'react';
import { Platform, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { resolveDurationMs, resolvePressScale } from '@ramassa/shared/tokens/motion';

const PressableAnimatedView =
  Platform.OS === 'web' ? cssInterop(Animated.View, { className: 'style' }) : Animated.View;

/**
 * The press response every touchable in the app shares (RAPP-70). The single
 * cheapest thing that separates a premium app from a functional one: a control
 * that answers the finger before the screen changes.
 *
 * Driven by `GestureDetector` rather than `Pressable`'s `onPressIn`/`onPressOut`
 * because gesture callbacks are worklets that run on the UI thread: the scale
 * responds even while the JS thread is busy, which on the low-end Android this
 * app targets is most of the time. Only `transform` and `opacity` animate, so
 * the GPU does the work and no layout pass runs.
 *
 * Built against Gesture Handler 2.32, the version Expo SDK 57 aligns to. 3.1.0
 * was tried and reverted: its native module intercepts React Native's touch
 * responder system, so NO touchable in the app fires, including a plain RN
 * `Pressable` with no gesture-handler code in the tree at all. See RAPP-86 for
 * the reproduction matrix. Nothing about that failure is visible to a type
 * check or a test; it only shows on a device.
 *
 * The shared value stores press STATE (0 or 1) and the visuals are interpolated
 * from it, so the state stays the single source of truth. `.get()`/`.set()` are
 * used throughout for React Compiler compatibility (the app has it enabled).
 *
 * Reduce-motion is honoured by the token resolvers, not here: under it the
 * scale target is 1 and the duration 0, so the press is instant and still.
 */
export interface PressableScaleProps {
  readonly children: ReactNode;
  readonly onPress: () => void;
  /** Stable automation hook for flows that must verify control state. */
  readonly testID?: string;
  /** Required: this is the only label a screen reader gets for the control. */
  readonly accessibilityLabel: string;
  readonly accessibilityRole?: AccessibilityRole;
  /** Which feedback to fire on press. Omit for none (e.g. a nav row). */
  readonly haptic?: HapticFeedback;
  readonly className?: string;
  /**
   * For the handful of properties NativeWind cannot express (`borderCurve`, per
   * contract rule 17). Composed with the press animation rather than replacing
   * it, so a caller cannot accidentally switch the press response off. Pass a
   * hoisted constant, never an object literal.
   */
  readonly style?: StyleProp<ViewStyle>;
  readonly isDisabled?: boolean;
  /** In-flight primary action: announced as busy and blocks a double submit. */
  readonly isBusy?: boolean;
  /**
   * Selection state for option-style controls (chips, language buttons).
   * ANNOUNCED, not just painted: a selected state that is only a background
   * colour is invisible to a screen reader, and to any test that must verify
   * which option a tap actually landed on. Omit for plain buttons.
   */
  readonly isSelected?: boolean;
}

export function PressableScale({
  children,
  onPress,
  testID,
  accessibilityLabel,
  accessibilityRole = 'button',
  haptic,
  className,
  style,
  isDisabled = false,
  isBusy = false,
  isSelected,
}: PressableScaleProps) {
  const isReducedMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const pressedScale = resolvePressScale(isReducedMotion);
  const pressedOpacity = isReducedMotion ? 1 : 0.9;
  const durationMs = resolveDurationMs('fast', isReducedMotion);

  function handlePress() {
    if (haptic !== undefined) {
      playHaptic(haptic);
    }
    onPress();
  }

  const isInteractionBlocked = isDisabled || isBusy;

  const tap = Gesture.Tap()
    .enabled(!isInteractionBlocked)
    .onBegin(() => {
      pressed.set(withTiming(1, { duration: durationMs }));
    })
    .onFinalize(() => {
      pressed.set(withTiming(0, { duration: durationMs }));
    })
    .onEnd(() => {
      runOnJS(handlePress)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, pressedScale]) }],
    opacity: interpolate(pressed.get(), [0, 1], [1, pressedOpacity]),
  }));

  return (
    <GestureDetector gesture={tap}>
      <PressableAnimatedView
        testID={testID}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        aria-checked={accessibilityRole === 'checkbox' ? Boolean(isSelected) : undefined}
        accessibilityState={{
          disabled: isInteractionBlocked,
          busy: isBusy,
          ...(accessibilityRole === 'checkbox' ? { checked: Boolean(isSelected) } : {}),
          ...(isSelected === undefined ? {} : { selected: isSelected }),
        }}
        style={[animatedStyle, style]}
        className={className}
      >
        {children}
      </PressableAnimatedView>
    </GestureDetector>
  );
}
