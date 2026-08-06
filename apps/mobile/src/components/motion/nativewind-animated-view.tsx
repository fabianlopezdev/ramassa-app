import { cssInterop } from 'nativewind';
import { Platform } from 'react-native';
import Animated from 'react-native-reanimated';

/**
 * Reanimated's `Animated.View` wraps React Native's registered `View`, so on
 * web NativeWind never sees the wrapper's `className`. Register that wrapper
 * explicitly for the exported browser app. Native keeps the existing direct
 * component path so its rendering and animation behaviour are unchanged.
 */
export const NativeWindAnimatedView =
  Platform.OS === 'web' ? cssInterop(Animated.View, { className: 'style' }) : Animated.View;
