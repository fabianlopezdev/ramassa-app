import type { HapticFeedback } from '@/lib/haptics/haptic-policy';
import { playHaptic } from '@/lib/haptics/haptics';
import { useCallback, useMemo, type ReactNode } from 'react';
import {
  I18nManager,
  Pressable,
  View,
  type AccessibilityActionEvent,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motionTokens } from '@ramassa/shared/tokens/motion';
import { ACTIVATE_ACCESSIBILITY_ACTIONS } from './accessibility-actions';
import { useIsInNativeModal } from './native-modal-scope';
import { NativeWindAnimatedView } from './nativewind-animated-view';

const PRESS_IN_TIMING = { duration: motionTokens.depthPress.inMs } as const;
const PRESS_OUT_TIMING = { duration: motionTokens.depthPress.outMs } as const;
const REDUCED_MOTION_TIMING = { duration: 0 } as const;

interface PressableDepthProps {
  readonly children: ReactNode;
  readonly shadow: ReactNode;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  readonly accessibilityLanguage?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly isSelected?: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
  readonly haptic?: HapticFeedback;
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly faceClassName?: string;
  readonly faceStyle?: StyleProp<ViewStyle>;
  readonly inlineOffset: number;
  readonly blockOffset: number;
}

/** A stationary touch target and shadow, with a face that sinks on the UI thread. */
/** One control, two touch paths: the gesture press on screens, the platform press in a sheet. */
export function PressableDepth(props: PressableDepthProps) {
  return useIsInNativeModal() ? (
    <ModalPressableDepth {...props} />
  ) : (
    <GesturePressableDepth {...props} />
  );
}

/**
 * Inside a native Modal (see `NativeModalScope`): the same target, shadow and
 * face on the platform `Pressable`. The face stays put and the press answers
 * with the shared press opacity, since no UI-thread gesture reaches it.
 */
function ModalPressableDepth({
  children,
  shadow,
  accessibilityLabel,
  accessibilityHint,
  accessibilityLanguage,
  accessibilityRole = 'button',
  isSelected,
  testID,
  onPress,
  haptic,
  className,
  style,
  faceClassName,
  faceStyle,
}: PressableDepthProps) {
  const handlePress = useCallback(() => {
    if (haptic !== undefined) playHaptic(haptic);
    onPress();
  }, [haptic, onPress]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityLanguage={accessibilityLanguage}
      accessibilityState={
        isSelected === undefined ? undefined : { selected: isSelected, checked: isSelected }
      }
      aria-checked={
        accessibilityRole === 'radio' || accessibilityRole === 'checkbox' ? isSelected : undefined
      }
      onPress={handlePress}
      className={`${className ?? ''} active:opacity-90`}
      style={style}
    >
      {shadow}
      <View
        importantForAccessibility="no-hide-descendants"
        className={faceClassName}
        style={faceStyle}
      >
        {children}
      </View>
    </Pressable>
  );
}

function GesturePressableDepth({
  children,
  shadow,
  accessibilityLabel,
  accessibilityHint,
  accessibilityLanguage,
  accessibilityRole = 'button',
  isSelected,
  testID,
  onPress,
  haptic,
  className,
  style,
  faceClassName,
  faceStyle,
  inlineOffset,
  blockOffset,
}: PressableDepthProps) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const direction = I18nManager.isRTL ? -1 : 1;
  const pressInTiming = reduced ? REDUCED_MOTION_TIMING : PRESS_IN_TIMING;
  const pressOutTiming = reduced ? REDUCED_MOTION_TIMING : PRESS_OUT_TIMING;
  const handlePress = useCallback(() => {
    if (haptic !== undefined) playHaptic(haptic);
    onPress();
  }, [haptic, onPress]);
  const handleAccessibilityAction = useCallback(
    ({ nativeEvent }: AccessibilityActionEvent) => {
      if (nativeEvent.actionName === 'activate') handlePress();
    },
    [handlePress],
  );
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .onBegin(() => {
          pressed.set(withTiming(1, pressInTiming));
        })
        .onFinalize(() => {
          pressed.set(withTiming(0, pressOutTiming));
        })
        .onEnd((_event, success) => {
          if (success) runOnJS(handlePress)();
        }),
    [handlePress, pressed, pressInTiming, pressOutTiming],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: reduced ? 0 : pressed.get() * inlineOffset * direction },
      { translateY: reduced ? 0 : pressed.get() * blockOffset },
    ],
    opacity: reduced ? 1 - pressed.get() * (1 - motionTokens.press.opacity) : 1,
  }));

  return (
    <GestureDetector gesture={tap}>
      <View
        accessible
        testID={testID}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityLanguage={accessibilityLanguage}
        onAccessibilityTap={handlePress}
        accessibilityActions={ACTIVATE_ACCESSIBILITY_ACTIONS}
        onAccessibilityAction={handleAccessibilityAction}
        accessibilityState={
          isSelected === undefined ? undefined : { selected: isSelected, checked: isSelected }
        }
        aria-checked={
          accessibilityRole === 'radio' || accessibilityRole === 'checkbox' ? isSelected : undefined
        }
        className={className}
        style={style}
      >
        {shadow}
        <NativeWindAnimatedView
          importantForAccessibility="no-hide-descendants"
          className={faceClassName}
          style={[faceStyle, animatedStyle]}
        >
          {children}
        </NativeWindAnimatedView>
      </View>
    </GestureDetector>
  );
}
