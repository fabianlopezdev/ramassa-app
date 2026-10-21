import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { contrastRatio } from '@ramassa/shared/organization-settings';
import { tokens } from '@ramassa/shared/tokens';

const onChoose = mock(async () => undefined);

mock.module('@/components/motion/pressable-depth', () => ({
  PressableDepth: ({
    accessibilityLabel,
    accessibilityLanguage,
    children,
    isSelected,
    onPress,
    testID,
    style,
    faceStyle,
    faceClassName,
    accessibilityRole,
  }: {
    readonly accessibilityLabel: string;
    readonly accessibilityLanguage?: string;
    readonly accessibilityRole: string;
    readonly children: ReactNode;
    readonly isSelected?: boolean;
    readonly onPress: () => void;
    readonly testID?: string;
    readonly style: { paddingBottom: number };
    readonly faceStyle: { height?: number; minHeight?: number };
    readonly faceClassName: string;
  }) =>
    createElement(
      'button',
      {
        'aria-label': accessibilityLabel,
        lang: accessibilityLanguage,
        role: accessibilityRole,
        'aria-checked': isSelected,
        className: faceClassName,
        'data-testid': testID,
        onClick: onPress,
        style: { height: (faceStyle.height ?? faceStyle.minHeight ?? 0) + style.paddingBottom },
      },
      children,
    ),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    className,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    className: string;
    accessibilityLabel: string;
  }) =>
    createElement(
      'button',
      { onClick: onPress, className, 'aria-label': accessibilityLabel },
      children,
    ),
}));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
let fontScale = 1;
mock.module('react-native', () => ({
  useWindowDimensions: () => ({ fontScale }),
  Text: ({ children, className }: { readonly children: ReactNode; readonly className?: string }) =>
    createElement('span', { className }, children),
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

  for (const [language, nativeName] of [
    ['ca', 'Català'],
    ['es', 'Español'],
    ['en', 'English'],
    ['ar', 'العربية'],
    ['fa', 'فارسی'],
  ]) {
    expect(view.getByRole('radio', { name: nativeName }).getAttribute('lang')).toBe(language);
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

const { OptionChip } = await import('../onboarding/option-chip');
test('compact option choices reuse the picker surface while keeping height and button semantics', () => {
  fontScale = 1;
  const onPress = mock(() => {});
  const view = render(createElement(OptionChip, { label: 'M', isSelected: true, onPress }));
  const option = view.getByRole('button', { name: 'M' });
  expect(option.className).toContain('border-primary');
  expect(option.style.height).toBe('64px');
  expect(option.getAttribute('aria-checked')).toBe('true');
  expect(option.querySelector('[aria-hidden="false"]') !== null).toBe(true);
  fireEvent.click(option);
  expect(onPress).toHaveBeenCalledTimes(1);
  fontScale = 2;
  view.rerender(createElement(OptionChip, { label: 'M', isSelected: false, onPress }));
  expect(view.getByRole('button', { name: 'M' }).style.height).toBe('128px');
  view.unmount();
});

test('raised option buttons support unanswered single-choice questions', () => {
  fontScale = 1;
  const onPress = mock(() => {});
  const view = render(
    createElement(OptionChip, {
      label: 'Yes',
      accessibilityRole: 'radio',
      isSelected: false,
      onPress,
    }),
  );
  const option = view.queryByRole('radio', { name: 'Yes' });
  expect(option !== null).toBe(true);
  expect(option?.getAttribute('aria-checked')).toBe('false');
  expect(option?.className).toContain('border-primary');
  if (option) fireEvent.click(option);
  expect(onPress).toHaveBeenCalledTimes(1);
  view.unmount();
});

function foregroundColor(label: HTMLElement): string {
  const palette: Readonly<Record<string, string>> = {
    'text-primary': tokens.colors.primary.DEFAULT,
    'text-primary-dark': tokens.colors.primary.dark,
    'text-neutral-900': tokens.colors.neutral[900],
  };
  const color = label.className
    .split(' ')
    .map((name) => palette[name])
    .find(Boolean);
  expect(color).toBeDefined();
  return color!;
}

test('selected and unselected choice labels meet normal text contrast without changing typography', () => {
  fontScale = 1;
  const view = render(createElement(LanguageChoiceList, { selectedLanguage: 'ca', onChoose }));
  const selected = view.getByText('Català');
  const unselected = view.getByText('English');
  expect(
    contrastRatio(foregroundColor(selected), tokens.colors.secondary.DEFAULT),
  ).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(foregroundColor(unselected), tokens.colors.white)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(selected.classList.contains('font-medium')).toBe(true);
  expect(unselected.classList.contains('font-medium')).toBe(true);
  expect(selected.classList.contains('text-form')).toBe(true);
  expect(unselected.classList.contains('text-form')).toBe(true);
  view.unmount();
  const choice = render(
    createElement(OptionChip, { label: 'Yes', isSelected: true, onPress: () => {} }),
  );
  expect(
    contrastRatio(foregroundColor(choice.getByText('Yes')), tokens.colors.secondary.DEFAULT),
  ).toBeGreaterThanOrEqual(4.5);
});
