import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
mock.module('react-native', () => ({
  View: box,
  Text: ({ children, className }: { children: ReactNode; className: string }) =>
    createElement('span', { className }, children),
  ActivityIndicator: () => createElement('span', { role: 'progressbar' }),
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    className,
    onPress,
    isDisabled,
    isBusy,
  }: {
    children: ReactNode;
    className: string;
    onPress: () => void;
    isDisabled: boolean;
    isBusy: boolean;
  }) =>
    createElement(
      'button',
      { className, onClick: onPress, disabled: isDisabled || isBusy, 'aria-busy': isBusy },
      children,
    ),
}));
afterAll(() => mock.restore());
const { AuthSubmitButton } = await import('./auth-submit-button');

test('disabled action is neutral, blocks taps, and returns to brand colors when enabled', () => {
  const onPress = mock(() => {});
  const props = { label: 'Continue', onPress };
  const view = render(createElement(AuthSubmitButton, { ...props, disabled: true }));
  const button = view.getByRole('button');
  expect(button.classList.contains('bg-neutral-200')).toBe(true);
  expect(button.classList.contains('bg-primary')).toBe(false);
  expect(view.getByText('Continue').classList.contains('text-neutral-600')).toBe(true);
  expect(button.className).not.toContain('opacity-');
  fireEvent.click(button);
  expect(onPress).not.toHaveBeenCalled();
  view.rerender(createElement(AuthSubmitButton, { ...props, disabled: false }));
  expect(button.classList.contains('bg-primary')).toBe(true);
  expect(button.classList.contains('bg-neutral-200')).toBe(false);
  expect(view.getByText('Continue').classList.contains('text-white')).toBe(true);
  expect(button.hasAttribute('disabled')).toBe(false);
  fireEvent.click(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('busy action keeps its progress indicator and prevents a second submission', () => {
  const onPress = mock(() => {});
  const view = render(
    createElement(AuthSubmitButton, { label: 'Continue', onPress, isLoading: true }),
  );
  expect(view.getByRole('progressbar')).toBeTruthy();
  expect(view.getByRole('button').getAttribute('aria-busy')).toBe('true');
  fireEvent.click(view.getByRole('button'));
  expect(onPress).not.toHaveBeenCalled();
});
