import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, useRef, type ReactNode } from 'react';
import type { AccessibilityActionEvent, ViewProps } from 'react-native';

let surface: ViewProps;
let end: (_event: unknown, success: boolean) => void;
const haptic = mock(() => {});
const nativeView = (props: ViewProps & { children?: ReactNode }) => {
  if (props.accessible) surface = props;
  return createElement('div', null, props.children);
};
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: haptic }));
mock.module('react-native', () => ({
  View: nativeView,
  I18nManager: { isRTL: false },
  StyleSheet: { create: (value: unknown) => value },
}));
mock.module('./nativewind-animated-view', () => ({ NativeWindAnimatedView: nativeView }));
mock.module('react-native-reanimated', () => ({
  useReducedMotion: () => true,
  useSharedValue: (initial: number) => {
    const value = useRef(initial);
    return useRef({ get: () => value.current, set: (next: number) => (value.current = next) })
      .current;
  },
  useAnimatedStyle: (callback: () => unknown) => callback(),
  withTiming: (value: number) => value,
  interpolate: (value: number) => value,
  runOnJS: (callback: () => void) => callback,
}));
mock.module('react-native-gesture-handler', () => ({
  Gesture: {
    Tap: () => {
      const gesture = {
        enabled: () => gesture,
        onBegin: () => gesture,
        onFinalize: () => gesture,
        onEnd: (callback: typeof end) => {
          end = callback;
          return gesture;
        },
      };
      return gesture;
    },
  },
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));
const { PressableScale } = await import('./pressable-scale');
const { PressableDepth } = await import('./pressable-depth');
afterAll(() => mock.restore());

const action = (actionName: string) =>
  ({ nativeEvent: { actionName } }) as AccessibilityActionEvent;
const props = { accessibilityLabel: 'Continue', haptic: 'selection' as const, children: 'label' };

test.each(['scale', 'depth'] as const)('%s supports native assistive activation', (kind) => {
  const onPress = mock(() => {});
  haptic.mockClear();
  const view = render(
    kind === 'scale'
      ? createElement(PressableScale, { ...props, onPress })
      : createElement(PressableDepth, {
          ...props,
          onPress,
          inlineOffset: 4,
          blockOffset: 6,
          shadow: null,
        }),
  );
  expect(surface.onAccessibilityTap).toBeFunction();
  surface.onAccessibilityTap?.();
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(surface.accessibilityActions).toContainEqual({ name: 'activate' });
  expect(surface.onAccessibilityAction).toBeFunction();
  surface.onAccessibilityAction?.(action('activate'));
  expect(onPress).toHaveBeenCalledTimes(2);
  surface.onAccessibilityAction?.(action('increment'));
  expect(onPress).toHaveBeenCalledTimes(2);
  expect(haptic).toHaveBeenCalledTimes(2);
  view.unmount();
});

test.each([
  { isDisabled: true, isBusy: false },
  { isDisabled: false, isBusy: true },
])('blocked scale action cannot be submitted by assistive technology: %j', (state) => {
  const onPress = mock(() => {});
  haptic.mockClear();
  const view = render(createElement(PressableScale, { ...props, onPress, ...state }));
  expect(surface['aria-disabled']).toBe(true);
  expect(surface['aria-busy']).toBe(state.isBusy);
  surface.onAccessibilityTap?.();
  surface.onAccessibilityAction?.(action('activate'));
  expect(onPress).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
  view.unmount();
});

test('scale action ignores a cancelled tap and accepts a successful tap once', () => {
  const onPress = mock(() => {});
  const view = render(createElement(PressableScale, { ...props, onPress }));
  end({}, false);
  expect(onPress).not.toHaveBeenCalled();
  end({}, true);
  expect(onPress).toHaveBeenCalledTimes(1);
  view.unmount();
});
