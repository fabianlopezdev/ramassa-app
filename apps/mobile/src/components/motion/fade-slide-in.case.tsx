import { act, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, useRef, type ReactNode } from 'react';

let onLayout: () => void;
let reduced = false;
let complete: ((finished: boolean) => void) | undefined;
let renderedProps: Record<string, unknown>;
const timing = mock((target: number, _config: unknown, callback?: typeof complete) => {
  void _config;
  complete = callback;
  return target;
});
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
  runOnJS: (callback: unknown) => callback,
  Easing: { out: () => undefined, inOut: () => undefined, cubic: undefined, quad: undefined },
}));
mock.module('./nativewind-animated-view', () => ({
  NativeWindAnimatedView: (props: { onLayout: () => void; children: ReactNode }) => {
    onLayout = props.onLayout;
    renderedProps = props;
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

test('layered cards start hidden, fade as a group, and release the cache after entrance', () => {
  timing.mockClear();
  delay.mockClear();
  const view = render(
    createElement(FadeSlideIn, {
      preset: 'onboarding',
      index: 1,
      composite: true,
      children: 'card',
    }),
  );
  expect(renderedProps.style).toEqual({ opacity: 0, transform: [{ translateY: 24 }] });
  expect(renderedProps.needsOffscreenAlphaCompositing).toBe(true);
  expect(renderedProps.renderToHardwareTextureAndroid).toBe(true);
  expect(renderedProps.shouldRasterizeIOS).toBe(true);
  act(() => onLayout());
  expect(delay.mock.calls[0]?.[0]).toBe(300);
  act(() => complete?.(true));
  expect(renderedProps.style).toEqual({ opacity: 1, transform: [{ translateY: 0 }] });
  expect(renderedProps.renderToHardwareTextureAndroid).toBe(false);
  expect(renderedProps.shouldRasterizeIOS).toBe(false);
  expect(timing).toHaveBeenCalledTimes(1);
  view.unmount();
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
