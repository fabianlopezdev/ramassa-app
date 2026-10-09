import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, useRef, type ReactNode } from 'react';

let reduced = false;
let value = 0;
const styles: Array<() => { transform: Array<{ scaleX?: number }> }> = [];
const timing = mock((target: number, config: { duration: number }) => {
  expect(config.duration).toBeGreaterThan(0);
  return target;
});
mock.module('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('./nativewind-animated-view', () => ({ NativeWindAnimatedView: () => null }));
mock.module('react-native-reanimated', () => ({
  useReducedMotion: () => reduced,
  useSharedValue: (initial: number) => {
    const state = useRef({
      get: () => value,
      set: (next: number) => {
        value = next;
      },
    });
    const first = useRef(true);
    if (first.current) {
      value = initial;
      first.current = false;
    }
    return state.current;
  },
  useAnimatedStyle: (callback: (typeof styles)[number]) => {
    styles.push(callback);
    return callback();
  },
  withTiming: timing,
  cancelAnimation: () => undefined,
  Easing: { linear: undefined },
}));
const { DrawnCheckmark } = await import('./drawn-checkmark');
afterAll(() => mock.restore());

test('draws short stroke before long stroke and handles selection changes', () => {
  styles.length = 0;
  const view = render(createElement(DrawnCheckmark, { active: false }));
  expect(styles[0]!().transform[1]!.scaleX).toBe(0);
  value = 0.35;
  expect(styles[0]!().transform[1]!.scaleX).toBe(1);
  expect(styles[1]!().transform[1]!.scaleX).toBe(0);
  view.rerender(createElement(DrawnCheckmark, { active: true }));
  expect(value).toBe(1);
  view.rerender(createElement(DrawnCheckmark, { active: false }));
  expect(value).toBe(0);
  expect(timing.mock.calls.map((call) => call[1].duration)).toEqual([320, 150]);
  view.unmount();
});

test('reduced motion changes selection immediately without animation', () => {
  reduced = true;
  timing.mockClear();
  const view = render(createElement(DrawnCheckmark, { active: false }));
  view.rerender(createElement(DrawnCheckmark, { active: true }));
  expect(value).toBe(1);
  expect(timing).not.toHaveBeenCalled();
  view.unmount();
});
