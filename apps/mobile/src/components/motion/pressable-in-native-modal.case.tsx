import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, useRef, type ReactNode } from 'react';
import type { PressableProps, ViewProps } from 'react-native';

const seen: { pressable: PressableProps | null } = { pressable: null };
// Read through a function so TypeScript does not narrow on the reset before render.
const lastPressable = (): PressableProps | null => seen.pressable;
let gestureDetectors = 0;
const haptic = mock(() => {});
const nativeView = (props: ViewProps & { children?: ReactNode }) =>
  createElement('div', null, props.children);
const nativePressable = (props: PressableProps & { children?: ReactNode }) => {
  seen.pressable = props;
  return createElement('div', null, props.children as ReactNode);
};
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: haptic }));
mock.module('react-native', () => ({
  View: nativeView,
  Pressable: nativePressable,
  I18nManager: { isRTL: false },
  StyleSheet: { create: (value: unknown) => value },
}));
mock.module('./nativewind-animated-view', () => ({ NativeWindAnimatedView: nativeView }));
mock.module('react-native-reanimated', () => ({
  useReducedMotion: () => false,
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
      const gesture: Record<string, () => unknown> = {};
      for (const key of ['enabled', 'onBegin', 'onFinalize', 'onEnd']) gesture[key] = () => gesture;
      return gesture;
    },
  },
  GestureDetector: ({ children }: { children: ReactNode }) => {
    gestureDetectors += 1;
    return children;
  },
}));
const { PressableScale } = await import('./pressable-scale');
const { PressableDepth } = await import('./pressable-depth');
const { NativeModalScope } = await import('./native-modal-scope');
afterAll(() => mock.restore());

const props = { accessibilityLabel: 'Close', haptic: 'tapLight' as const, children: 'label' };
const inModal = (child: ReturnType<typeof createElement>) =>
  createElement(NativeModalScope, null, child);

test.each(['scale', 'depth'] as const)(
  '%s inside a native Modal is a platform Pressable that keeps its press and haptic',
  (kind) => {
    const onPress = mock(() => {});
    seen.pressable = null;
    gestureDetectors = 0;
    haptic.mockClear();
    const control =
      kind === 'scale'
        ? createElement(PressableScale, { ...props, onPress, testID: 'sheet-close' })
        : createElement(PressableDepth, {
            ...props,
            onPress,
            testID: 'sheet-close',
            inlineOffset: 4,
            blockOffset: 6,
            shadow: null,
          });
    const view = render(inModal(control));
    expect(gestureDetectors).toBe(0);
    expect(lastPressable()).not.toBeNull();
    expect(lastPressable()?.testID).toBe('sheet-close');
    expect(lastPressable()?.accessibilityLabel).toBe('Close');
    lastPressable()?.onPress?.({} as never);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1);
    view.unmount();
  },
);

test('a blocked scale control inside a native Modal is disabled', () => {
  const onPress = mock(() => {});
  const view = render(inModal(createElement(PressableScale, { ...props, onPress, isBusy: true })));
  expect(lastPressable()?.disabled).toBe(true);
  expect(lastPressable()?.accessibilityState).toMatchObject({ busy: true, disabled: true });
  view.unmount();
});

test('outside a native Modal the controls keep the gesture press', () => {
  seen.pressable = null;
  gestureDetectors = 0;
  const view = render(createElement(PressableScale, { ...props, onPress: () => {} }));
  expect(gestureDetectors).toBe(1);
  expect(lastPressable()).toBeNull();
  view.unmount();
});
