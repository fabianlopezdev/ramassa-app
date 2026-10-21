import { activeFieldFocusId } from '@/components/forms/field-focus-owner';
import { NativeWindAnimatedView } from '@/components/motion/nativewind-animated-view';
import { continuousCorners } from '@/lib/continuous-corners';
import { View, type ViewStyle } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';
import { tokens } from '@ramassa/shared/tokens';

const focusBorderStyle: ViewStyle = {
  ...continuousCorners,
  position: 'absolute',
  top: 0,
  bottom: 0,
  start: 0,
  end: 0,
  borderRadius: tokens.radius.lg,
  borderWidth: tokens.formField.focusBorderWidth,
};
const focusRingStyle: ViewStyle = {
  ...continuousCorners,
  position: 'absolute',
  top: -tokens.formField.focusRingWidth,
  bottom: -tokens.formField.focusRingWidth,
  start: -tokens.formField.focusRingWidth,
  end: -tokens.formField.focusRingWidth,
  borderRadius: tokens.radius.lg + tokens.formField.focusRingWidth,
  borderWidth: tokens.formField.focusRingWidth,
};

/** Decorative overlays leave layout, text padding and native input taps untouched. */
export function FieldFocusRing({
  tone,
  fieldId,
}: {
  readonly tone: 'secondary' | 'error';
  readonly fieldId: string;
}) {
  const visibilityStyle = useAnimatedStyle(() => ({
    opacity: activeFieldFocusId.get() === fieldId ? 1 : 0,
  }));
  return (
    <NativeWindAnimatedView
      style={visibilityStyle}
      testID="form-field-focus-ring"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`absolute inset-0 ${tone === 'error' ? 'border-error' : 'border-secondary'}`}
    >
      <View
        style={focusBorderStyle}
        className={tone === 'error' ? 'border-error' : 'border-secondary'}
      />
      <View
        style={focusRingStyle}
        className={tone === 'error' ? 'border-error/20' : 'border-secondary/20'}
      />
    </NativeWindAnimatedView>
  );
}
