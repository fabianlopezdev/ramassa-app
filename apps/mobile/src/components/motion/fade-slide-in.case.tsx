import { act, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, useRef, type ReactNode } from 'react';

let onLayout: () => void;
let reduced = false;
const timing = mock((target: number) => target);
const delay = mock((_ms: number, target: number) => target);
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
  useAnimatedStyle: (callback: () => unknown) => callback(),
  withTiming: timing,
  withDelay: delay,
  cancelAnimation: () => undefined,
  Easing: { out: () => undefined, inOut: () => undefined, cubic: undefined, quad: undefined },
}));
mock.module('./nativewind-animated-view', () => ({
  NativeWindAnimatedView: (props: { onLayout: () => void; children: ReactNode }) => {
    onLayout = props.onLayout;
    return createElement('div', null, props.children);
  },
}));
const { FadeSlideIn } = await import('./fade-slide-in');
afterAll(() => mock.restore());

test('logo waits for layout and its downloaded image, then does not replay on a parent render', () => {
  timing.mockClear();
  const view = render(
    createElement(FadeSlideIn, { preset: 'logo', ready: false, children: 'logo' }),
  );
  act(() => onLayout());
  expect(timing).not.toHaveBeenCalled();
  view.rerender(createElement(FadeSlideIn, { preset: 'logo', ready: true, children: 'logo' }));
  expect(timing).toHaveBeenCalledTimes(1);
  view.rerender(createElement(FadeSlideIn, { preset: 'logo', ready: true, children: 'updated' }));
  expect(timing).toHaveBeenCalledTimes(1);
});

test('later rows have a visible delay, but reduced motion removes all waiting', () => {
  delay.mockClear();
  const view = render(
    createElement(FadeSlideIn, { preset: 'onboarding', index: 4, children: 'Farsi' }),
  );
  act(() => onLayout());
  expect(delay.mock.calls[0]?.[0]).toBe(660);
  view.unmount();
  reduced = true;
  delay.mockClear();
  render(createElement(FadeSlideIn, { preset: 'onboarding', index: 4, children: 'Farsi' }));
  act(() => onLayout());
  expect(delay.mock.calls[0]?.[0]).toBe(0);
  reduced = false;
});
