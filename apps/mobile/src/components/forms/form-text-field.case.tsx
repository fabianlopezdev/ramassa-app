import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, mock, test } from 'bun:test';
import {
  createElement,
  createRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import type { TextInput } from 'react-native';

let fontScale = 1;
const flatten = (value: unknown): CSSProperties =>
  Array.isArray(value)
    ? Object.assign({}, ...value.map(flatten))
    : typeof value === 'object' && value !== null
      ? (value as CSSProperties)
      : {};
const Box = ({
  children,
  testID,
  className,
  style,
  pointerEvents,
  accessibilityElementsHidden,
}: {
  children?: ReactNode;
  testID?: string;
  className?: string;
  style?: unknown;
  pointerEvents?: string;
  accessibilityElementsHidden?: boolean;
}) =>
  createElement(
    'div',
    {
      'data-testid': testID,
      className,
      style: flatten(style),
      'data-pointer-events': pointerEvents,
      'aria-hidden': accessibilityElementsHidden,
    },
    children,
  );
mock.module('react-native', () => ({
  useWindowDimensions: () => ({ fontScale }),
  AccessibilityInfo: { announceForAccessibilityWithOptions: () => {} },
  Text: ({
    children,
    accessibilityLiveRegion,
  }: {
    children: ReactNode;
    accessibilityLiveRegion?: string;
  }) => createElement('span', { 'aria-live': accessibilityLiveRegion }, children),
  View: Box,
  TextInput: ({
    accessibilityLabel,
    accessibilityHint,
    className,
    style,
    onChangeText,
    onBlur,
    onFocus,
    onPressIn,
    onPressOut,
    onPress,
    ref,
    value,
    multiline,
  }: {
    accessibilityLabel: string;
    accessibilityHint?: string;
    className: string;
    style: unknown;
    onChangeText?: (value: string) => void;
    onBlur?: () => void;
    onFocus?: () => void;
    onPressIn?: () => void;
    onPressOut?: () => void;
    onPress?: () => void;
    ref?: Ref<HTMLInputElement>;
    value?: string;
    multiline?: boolean;
  }) =>
    createElement('input', {
      ref,
      value,
      'aria-label': accessibilityLabel,
      'data-hint': accessibilityHint,
      className,
      'data-multiline': multiline,
      style: flatten(style),
      onBlur,
      onFocus,
      onMouseDown: onPressIn,
      onMouseUp: onPressOut,
      onClick: onPress,
      onInput: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    }),
}));
mock.module('@/lib/continuous-corners', () => ({
  continuousCorners: {},
  composeContinuousTextStyle: (style: unknown) => style,
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => 'font-arabic' }));
mock.module('@/components/motion/nativewind-animated-view', () => ({
  NativeWindAnimatedView: Box,
}));
let activeOwner: string | null = null;
const focusListeners = new Set<() => void>();
const sharedOwner = {
  get: () => activeOwner,
  set: (value: string | null) => {
    if (activeOwner === value) return;
    activeOwner = value;
    focusListeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    focusListeners.add(listener);
    return () => {
      focusListeners.delete(listener);
    };
  },
};
mock.module('react-native-reanimated', () => ({
  makeMutable: () => sharedOwner,
  useAnimatedStyle: (compute: () => unknown) => {
    useSyncExternalStore(sharedOwner.subscribe, sharedOwner.get, sharedOwner.get);
    return compute();
  },
}));
const { FormTextField } = await import('./form-text-field');
const { AuthTextField } = await import('../auth/auth-text-field');
afterEach(() => {
  cleanup();
  fontScale = 1;
});

test('the compatibility export is the shared component and keeps native input behavior', () => {
  expect(AuthTextField).toBe(FormTextField);
  const onChangeText = mock(() => {});
  const onBlur = mock(() => {});
  const ref = createRef<TextInput>();
  const view = render(createElement(FormTextField, { label: 'Name', onChangeText, onBlur, ref }));
  const input = view.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
  expect(Object.is(ref.current, input)).toBe(true);
  fireEvent.input(input, { target: { value: 'Laia' } });
  fireEvent.blur(input);
  expect(onChangeText).toHaveBeenCalledWith('Laia');
  expect(onBlur).toHaveBeenCalledTimes(1);
  expect(input.className).toContain('border-primary');
  expect(input.className).toContain('rounded-lg');
  expect(input.className).toContain('font-arabic');
  expect(input.className).not.toContain('shadow');
  expect(input.className).not.toContain('bg-');
  expect(input.style.minHeight).toBe('64px');
});

test('larger text grows the minimum height without fixing multiline height or hiding errors', () => {
  fontScale = 2;
  const view = render(
    createElement(FormTextField, {
      label: 'Document',
      hint: 'Help',
      errorMessage: 'Enter its number',
      multiline: true,
    }),
  );
  const input = view.getByRole('textbox') as HTMLInputElement;
  expect(input.style.minHeight).toBe('128px');
  expect(input.style.height).toBe('');
  expect(input.className).toContain('border-error');
  expect(input.className).not.toContain('border-primary');
  expect(input.getAttribute('data-hint')).toBe('Enter its number');
  expect(view.getByText('Enter its number').getAttribute('aria-live')).toBe('polite');
  expect(view.getByText('Help')).toBeTruthy();
});

test('only the focused field has a decorative ring and preserves caller callbacks and dimensions', () => {
  const onFocus = mock(() => {});
  const onBlur = mock(() => {});
  const view = render(
    createElement(
      'div',
      null,
      createElement(FormTextField, { label: 'First', onFocus, onBlur }),
      createElement(FormTextField, { label: 'Second' }),
    ),
  );
  const first = view.getByRole('textbox', { name: 'First' }) as HTMLInputElement;
  const second = view.getByRole('textbox', { name: 'Second' }) as HTMLInputElement;
  const initialStyle = first.getAttribute('style');
  const ring = first.parentElement?.querySelector(
    '[data-testid="form-field-focus-ring"]',
  ) as HTMLElement;
  const secondRing = second.parentElement?.querySelector(
    '[data-testid="form-field-focus-ring"]',
  ) as HTMLElement;
  expect(ring.style.opacity).toBe('0');
  expect(secondRing.style.opacity).toBe('0');
  fireEvent.focus(first);
  expect(ring.style.opacity).toBe('1');
  expect(ring.className).toContain('border-primary');
  expect(ring.getAttribute('data-pointer-events')).toBe('none');
  expect(ring.getAttribute('aria-hidden')).toBe('true');
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(first.getAttribute('style')).toBe(initialStyle);
  fireEvent.blur(first);
  expect(onBlur).toHaveBeenCalledTimes(1);
  expect(ring.style.opacity).toBe('0');
  fireEvent.focus(second);
  expect(secondRing.style.opacity).toBe('1');
  expect(ring.style.opacity).toBe('0');
  expect(first.parentElement?.querySelector('[data-testid="form-field-focus-ring"]')).toBe(ring);
  expect(view.getAllByTestId('form-field-focus-ring')).toHaveLength(2);
});

test('a focused invalid field keeps a red focus ring and the same error feedback', () => {
  const view = render(
    createElement(FormTextField, { label: 'Number', errorMessage: 'Enter a number' }),
  );
  fireEvent.focus(view.getByRole('textbox'));
  const ring = view.getByTestId('form-field-focus-ring');
  expect(ring.className).toContain('border-error');
  expect(ring.className).not.toContain('border-primary');
  expect(view.getByText('Enter a number').getAttribute('aria-live')).toBe('polite');
});

test('press-in gives feedback before focus, cancelled presses clear, and accepted taps keep it visible', () => {
  const onPressIn = mock(() => {});
  const onPressOut = mock(() => {});
  const onPress = mock(() => {});
  const view = render(
    createElement(FormTextField, { label: 'Name', onPressIn, onPressOut, onPress }),
  );
  const input = view.getByRole('textbox');
  const ring = view.getByTestId('form-field-focus-ring');
  expect(ring.style.opacity).toBe('0');
  fireEvent.mouseDown(input);
  expect(ring.style.opacity).toBe('1');
  expect(onPressIn).toHaveBeenCalledTimes(1);
  fireEvent.mouseUp(input);
  expect(ring.style.opacity).toBe('0');
  expect(onPressOut).toHaveBeenCalledTimes(1);
  fireEvent.click(input);
  expect(ring.style.opacity).toBe('1');
  expect(onPress).toHaveBeenCalledTimes(1);
  fireEvent.focus(input);
  fireEvent.mouseUp(input);
  expect(ring.style.opacity).toBe('1');
  fireEvent.blur(input);
  expect(ring.style.opacity).toBe('0');
});

test.each([{ readOnly: true }, { editable: false }])(
  'non-editable fields do not preview focus on a press',
  (props) => {
    const view = render(createElement(FormTextField, { label: 'Read only', ...props }));
    fireEvent.mouseDown(view.getByRole('textbox'));
    fireEvent.click(view.getByRole('textbox'));
    expect(view.getByTestId('form-field-focus-ring').style.opacity).toBe('0');
  },
);

test('touching Month transfers the ring before Day blur, and delayed Day events cannot steal it', () => {
  const view = render(
    createElement(
      'div',
      null,
      createElement(FormTextField, { label: 'Day' }),
      createElement(FormTextField, { label: 'Month' }),
    ),
  );
  const day = view.getByRole('textbox', { name: 'Day' });
  const month = view.getByRole('textbox', { name: 'Month' });
  const rings = view.getAllByTestId('form-field-focus-ring');
  fireEvent.focus(day);
  expect(rings.map((ring) => ring.style.opacity)).toEqual(['1', '0']);
  fireEvent.mouseDown(month);
  expect(rings.map((ring) => ring.style.opacity)).toEqual(['0', '1']);
  fireEvent.mouseUp(day);
  expect(rings.map((ring) => ring.style.opacity)).toEqual(['0', '1']);
  fireEvent.blur(day);
  expect(rings.map((ring) => ring.style.opacity)).toEqual(['0', '1']);
  fireEvent.focus(month);
  expect(rings.map((ring) => ring.style.opacity)).toEqual(['0', '1']);
});

test('cancelling a different field preview restores the still-focused field', () => {
  const view = render(
    createElement(
      'div',
      null,
      createElement(FormTextField, { label: 'Day' }),
      createElement(FormTextField, { label: 'Month' }),
    ),
  );
  const day = view.getByRole('textbox', { name: 'Day' });
  const month = view.getByRole('textbox', { name: 'Month' });
  const rings = view.getAllByTestId('form-field-focus-ring');
  fireEvent.focus(day);
  fireEvent.mouseDown(month);
  expect(rings.map((ring) => ring.style.opacity)).toEqual(['0', '1']);
  fireEvent.mouseUp(month);
  expect(rings.map((ring) => ring.style.opacity)).toEqual(['1', '0']);
});

test('short numeric fields keep full-width labels and errors, grow with text, and share their focus frame', () => {
  const view = render(
    createElement(FormTextField, {
      label: 'Number of dependants',
      inputWidth: 'short',
      errorMessage: 'Enter a valid number',
    }),
  );
  const input = view.getByRole('textbox');
  const frame = input.parentElement!;
  expect(frame.style.width).toBe('96px');
  expect(frame.style.maxWidth).toBe('100%');
  expect(frame.contains(view.getByText('Number of dependants'))).toBe(false);
  expect(frame.contains(view.getByText('Enter a valid number'))).toBe(false);
  expect(frame.contains(view.getByTestId('form-field-focus-ring'))).toBe(true);
  fontScale = 2;
  view.rerender(createElement(FormTextField, { label: 'Postcode', inputWidth: 'medium' }));
  expect(view.getByRole('textbox').parentElement!.style.width).toBe('320px');
});
