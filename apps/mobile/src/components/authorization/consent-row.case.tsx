import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const box = ({ children, className }: { children?: ReactNode; className?: string }) =>
  createElement('div', { className }, children);
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('react-native', () => ({ View: box, Text: box }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/motion/drawn-checkmark', () => ({
  DrawnCheckmark: ({ active }: { active: boolean }) =>
    createElement('span', { 'data-testid': 'drawn-check', 'data-active': active }),
}));
mock.module('@/components/forms/selection-choice-surface', () => ({
  SelectionChoiceSurface: ({
    children,
    label,
    isSelected,
    onPress,
    accessibilityRole,
  }: {
    children: ReactNode;
    label: string;
    isSelected: boolean;
    onPress: () => void;
    accessibilityRole: string;
  }) =>
    createElement(
      'button',
      {
        'aria-label': label,
        'aria-checked': isSelected,
        onClick: onPress,
        role: accessibilityRole,
      },
      children,
    ),
}));
const { ConsentRow } = await import('./consent-row');
afterAll(() => mock.restore());

test('empty checkbox is visible before selection and the same frame holds the drawing', () => {
  const toggle = mock(() => {});
  const props = {
    testID: 'accept',
    label: 'I accept the app terms',
    required: true,
    requiredMark: 'Required',
    checked: false,
    onToggle: toggle,
  };
  const view = render(createElement(ConsentRow, props));
  const choice = view.getByRole('checkbox', { name: 'I accept the app terms (Required)' });
  expect(choice.getAttribute('aria-checked')).toBe('false');
  const frame = view.getByTestId('drawn-check').parentElement;
  expect(frame?.className).toContain('border-2');
  expect(view.getByTestId('drawn-check').getAttribute('data-active')).toBe('false');
  fireEvent.click(choice);
  expect(toggle).toHaveBeenCalledTimes(1);
  view.rerender(createElement(ConsentRow, { ...props, checked: true }));
  expect(choice.getAttribute('aria-checked')).toBe('true');
  expect(view.getByTestId('drawn-check').getAttribute('data-active')).toBe('true');
  expect(view.getByTestId('drawn-check').parentElement).toBe(frame);
});

test('an Onboarding consent left unticked says why the form waits (RAPP-699)', () => {
  const props = {
    testID: 'wizard-consent-sortides',
    label: 'Vinc a les sortides.',
    required: true,
    requiredMark: 'Obligatori',
    checked: false,
    onToggle: () => {},
  };
  const view = render(createElement(ConsentRow, props));
  expect(view.queryByText('Marca aquesta autorització per continuar.')).toBeNull();
  view.rerender(
    createElement(ConsentRow, {
      ...props,
      errorMessage: 'Marca aquesta autorització per continuar.',
    }),
  );
  expect(view.getByText('Marca aquesta autorització per continuar.')).toBeTruthy();
  expect(view.getByRole('checkbox', { name: 'Vinc a les sortides. (Obligatori)' })).toBeTruthy();
});
