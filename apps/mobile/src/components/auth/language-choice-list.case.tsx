import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const onChoose = mock(async () => undefined);

mock.module('@/components/motion/pressable-depth', () => ({
  PressableDepth: ({
    accessibilityLabel,
    children,
    isSelected,
    onPress,
    testID,
    style,
    faceStyle,
    faceClassName,
  }: {
    readonly accessibilityLabel: string;
    readonly children: ReactNode;
    readonly isSelected?: boolean;
    readonly onPress: () => void;
    readonly testID?: string;
    readonly style: { paddingBottom: number };
    readonly faceStyle: { height: number };
    readonly faceClassName: string;
  }) =>
    createElement(
      'button',
      {
        'aria-label': accessibilityLabel,
        role: 'radio',
        'aria-checked': isSelected,
        className: faceClassName,
        'data-testid': testID,
        onClick: onPress,
        style: { height: faceStyle.height + style.paddingBottom },
      },
      children,
    ),
}));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
let fontScale = 1;
mock.module('react-native', () => ({
  useWindowDimensions: () => ({ fontScale }),
  Text: ({ children }: { readonly children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { readonly children: ReactNode }) => createElement('div', null, children),
}));

mock.module('@/components/motion/fade-slide-in', () => ({
  FadeSlideIn: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/components/motion/drawn-checkmark', () => ({
  DrawnCheckmark: () => createElement('span', null),
}));
mock.module('@/components/motion/selection-transition', () => ({
  SelectionTransition: ({ children, active }: { children?: ReactNode; active: boolean }) =>
    createElement('div', { 'aria-hidden': !active }, children),
}));
const { LanguageChoiceList } = await import('./language-choice-list');

beforeEach(() => onChoose.mockClear());
afterAll(() => mock.restore());

test('renders all five languages in their own script and announces the selected row', () => {
  const view = render(
    createElement(LanguageChoiceList, {
      selectedLanguage: 'ca',
      onChoose,
    }),
  );

  for (const nativeName of ['Català', 'Español', 'English', 'العربية', 'فارسی']) {
    expect(view.getByRole('radio', { name: nativeName })).toBeTruthy();
  }
  expect(view.getByRole('radio', { name: 'Català' }).getAttribute('aria-checked')).toBe('true');

  expect(
    view.getByRole('radio', { name: 'Català' }).querySelector('[aria-hidden="false"]'),
  ).toBeTruthy();
  expect(view.getByRole('radio', { name: 'English' }).className).toContain('bg-white');
  fireEvent.click(view.getByRole('radio', { name: 'العربية' }));
  expect(onChoose).toHaveBeenCalledWith('ar');
});

for (const scale of [1, 2]) {
  test(`all language cards share a height at font scale ${scale}`, () => {
    fontScale = scale;
    const view = render(createElement(LanguageChoiceList, { selectedLanguage: 'ar', onChoose }));
    const heights = view.getAllByRole('radio').map((button) => button.style.height);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBe(`${64 * scale}px`);
  });
}
