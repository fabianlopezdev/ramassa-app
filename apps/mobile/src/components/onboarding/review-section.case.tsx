import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ComponentType, type ReactNode } from 'react';

mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('nativewind', () => ({
  cssInterop: (Component: ComponentType<Record<string, unknown>>, mapping: unknown) => {
    expect(mapping).toEqual({
      className: { target: false, nativeStyleToProp: { color: 'tintColor' } },
    });
    return (props: Record<string, unknown>) =>
      createElement(Component, {
        ...props,
        tintColor: props.className === 'text-primary-dark' ? '#123456' : undefined,
      });
  },
}));
mock.module('expo-glass-effect', () => ({
  GlassView: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
}));
mock.module('expo-symbols', () => ({
  SymbolView: ({
    name,
    tintColor,
  }: {
    name: { ios: string; android: string; web: string };
    tintColor: string;
  }) =>
    createElement('span', {
      'data-testid': 'symbol',
      'data-color': tintColor,
      'data-names': JSON.stringify(name),
    }),
}));
mock.module('react-native', () => ({
  View: ({
    children,
    className,
    accessibilityLabel,
    accessibilityElementsHidden,
    importantForAccessibility,
  }: {
    children?: ReactNode;
    className?: string;
    accessibilityLabel?: string;
    accessibilityElementsHidden?: boolean;
    importantForAccessibility?: string;
  }) =>
    createElement(
      'div',
      {
        className,
        'aria-label': accessibilityLabel,
        'aria-hidden': accessibilityElementsHidden,
        'data-accessibility': importantForAccessibility,
      },
      children,
    ),
  Text: ({
    children,
    className,
    accessibilityRole,
    selectable,
  }: {
    children: ReactNode;
    className?: string;
    accessibilityRole?: string;
    selectable?: boolean;
  }) =>
    createElement(
      accessibilityRole === 'header' ? 'h2' : 'span',
      { className, 'data-selectable': selectable },
      children,
    ),
}));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
}));
const { ReviewSection, ReviewRow, ReviewEditAction } = await import('./review-section');
afterAll(() => mock.restore());

test('review header owns the edit action and rows retain grouped accessible values', () => {
  const onEdit = mock(() => {});
  const screen = render(
    createElement(ReviewSection, {
      title: 'Una mica més sobre tu',
      action: createElement(ReviewEditAction, { onPress: onEdit, label: 'Canvia' }),
      children: createElement(ReviewRow, {
        label: 'Data de naixement',
        value: '30/12/1955',
        icon: 'calendar',
      }),
    }),
  );
  expect(screen.queryByText('Canvia')).toBeNull();
  expect(screen.getByRole('heading').className).toContain('text-2xl');
  expect(screen.getByRole('heading').className).toContain('font-extrabold');
  const header = screen.getByRole('heading').parentElement;
  expect(header?.contains(screen.getByRole('button', { name: 'Canvia' }))).toBe(true);
  fireEvent.click(screen.getByRole('button'));
  expect(onEdit).toHaveBeenCalledTimes(1);
  const row = screen.getByLabelText('Data de naixement: 30/12/1955');
  expect(row.querySelector('[data-selectable="true"]')?.textContent).toBe('30/12/1955');
  expect(screen.getByText('30/12/1955').className).toContain('font-bold');
  expect(screen.getAllByTestId('symbol').at(-1)!.getAttribute('data-color')).toBe('#123456');
  const iconParent = screen.getAllByTestId('symbol').at(-1)!.parentElement;
  expect(iconParent?.className).toContain('bg-secondary/20');
  expect(iconParent?.getAttribute('aria-hidden')).toBe('true');
  expect(iconParent?.getAttribute('data-accessibility')).toBe('no-hide-descendants');
  screen.unmount();
});
