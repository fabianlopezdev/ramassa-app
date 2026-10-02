import type { HapticFeedback } from '@/lib/haptics/haptic-policy';
import { playHaptic } from '@/lib/haptics/haptics';
import { useCallback, useMemo, type ReactNode } from 'react';
import { I18nManager, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motionTokens } from '@ramassa/shared/tokens/motion';
import { NativeWindAnimatedView } from './nativewind-animated-view';

interface PressableDepthProps {
  readonly children: ReactNode;
  readonly shadow: ReactNode;
  readonly accessibilityLabel: string;
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
export function PressableDepth({
  children,
  shadow,
  accessibilityLabel,
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
  const handlePress = useCallback(() => {
    if (haptic !== undefined) playHaptic(haptic);
    onPress();
  }, [haptic, onPress]);
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .onBegin(() => {
          pressed.set(withTiming(1, { duration: reduced ? 0 : motionTokens.depthPress.inMs }));
        })
        .onFinalize(() => {
          pressed.set(withTiming(0, { duration: reduced ? 0 : motionTokens.depthPress.outMs }));
        })
        .onEnd((_event, success) => {
          if (success) runOnJS(handlePress)();
        }),
    [handlePress, pressed, reduced],
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
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
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
