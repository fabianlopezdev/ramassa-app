import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, useRef, type ReactNode } from 'react';

let reduced = false;
const direction = { isRTL: false };
let begin: () => void;
let finalize: () => void;
let end: (_event: unknown, success: boolean) => void;
let animated: () => { transform: unknown[]; opacity: number };
const haptic = mock(() => undefined);
const timing = mock((target: number, config: { duration: number }) => {
  expect(config.duration).toBeGreaterThanOrEqual(0);
  return target;
});
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: haptic }));
mock.module('react-native', () => ({
  I18nManager: direction,
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('react-native-reanimated', () => ({
  useReducedMotion: () => reduced,
  useSharedValue: (initial: number) => {
    const value = useRef(initial);
    return useRef({
      get: () => value.current,
      set: (next: number) => {
        value.current = next;
      },
    }).current;
  },
  useAnimatedStyle: (callback: typeof animated) => {
    animated = callback;
    return callback();
  },
  withTiming: timing,
  runOnJS: (callback: () => void) => callback,
}));
mock.module('react-native-gesture-handler', () => ({
  Gesture: {
    Tap: () => {
      const gesture = {
        onBegin: (callback: typeof begin) => {
          begin = callback;
          return gesture;
        },
        onFinalize: (callback: typeof finalize) => {
          finalize = callback;
          return gesture;
        },
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
mock.module('./nativewind-animated-view', () => ({
  NativeWindAnimatedView: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
const { PressableDepth } = await import('./pressable-depth');
afterAll(() => mock.restore());

test.each([false, true])('face meets its shadow, cancellation restores it, RTL=%s', (rtl) => {
  direction.isRTL = rtl;
  const press = mock(() => undefined);
  haptic.mockClear();
  const view = render(
    createElement(PressableDepth, {
      accessibilityLabel: 'Continue',
      onPress: press,
      haptic: 'tapLight',
      inlineOffset: 4,
      blockOffset: 6,
      shadow: 'shadow',
      children: 'face',
    }),
  );
  begin();
  expect(animated().transform).toEqual([{ translateX: rtl ? -4 : 4 }, { translateY: 6 }]);
  expect(animated().opacity).toBe(1);
  end({}, false);
  finalize();
  expect(animated().transform).toEqual([{ translateX: rtl ? -0 : 0 }, { translateY: 0 }]);
  expect(press).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
  begin();
  end({}, true);
  finalize();
  expect(press).toHaveBeenCalledTimes(1);
  expect(haptic).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('reduced motion gives immediate opacity feedback without travel', () => {
  reduced = true;
  const view = render(
    createElement(PressableDepth, {
      accessibilityLabel: 'Continue',
      onPress: () => undefined,
      inlineOffset: 4,
      blockOffset: 6,
      shadow: 'shadow',
      children: 'face',
    }),
  );
  begin();
  expect(animated().transform).toEqual([{ translateX: 0 }, { translateY: 0 }]);
  expect(animated().opacity).toBe(0.9);
  expect(timing.mock.calls.at(-1)?.[1].duration).toBe(0);
  finalize();
  expect(animated().opacity).toBe(1);
  view.unmount();
  reduced = false;
});
