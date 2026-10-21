import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, useState, type ReactNode } from 'react';

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { name?: string }) => (params?.name ? `${key}: ${params.name}` : key),
  }),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
let fontScale = 1;
mock.module('react-native', () => ({
  useWindowDimensions: () => ({ width: 402, fontScale }),
  Text: ({ children, className }: { children: ReactNode; className?: string }) =>
    createElement('span', { className }, children),
  View: ({
    children,
    className,
    testID,
  }: {
    children: ReactNode;
    className?: string;
    testID?: string;
  }) => createElement('div', { className, 'data-testid': testID }, children),
}));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
    onSubmitEditing,
    maxLength,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    onSubmitEditing: () => void;
    maxLength: number;
  }) =>
    createElement('input', {
      'aria-label': label,
      value,
      maxLength,
      onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
      onKeyDown: (event: { key: string }) => {
        if (event.key === 'Enter') onSubmitEditing();
      },
    }),
}));
mock.module('@/components/motion/pressable-depth', () => ({
  PressableDepth: ({
    children,
    accessibilityLabel,
    onPress,
    isSelected,
    faceStyle,
    style,
  }: {
    children: ReactNode;
    accessibilityLabel: string;
    onPress: () => void;
    isSelected?: boolean;
    faceStyle: { minHeight: number };
    style: { paddingBottom: number };
  }) =>
    createElement(
      'button',
      {
        'aria-label': accessibilityLabel,
        'aria-pressed': isSelected,
        onClick: onPress,
        style: { minHeight: faceStyle.minHeight + style.paddingBottom },
      },
      children,
    ),
}));
mock.module('@/components/motion/selection-transition', () => ({
  SelectionTransition: ({ active }: { active: boolean }) =>
    createElement('span', { 'data-selection-active': String(active) }),
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
  }) => createElement('button', { 'aria-label': accessibilityLabel, onClick: onPress }, children),
}));
mock.module('@/components/onboarding/question-help', () => ({ QuestionHelp: () => null }));
const { SupportingEntitiesField } = await import('./supporting-entities-field');
afterAll(() => mock.restore());

function Editor() {
  const [value, onChange] = useState<readonly string[]>([]);
  return createElement(SupportingEntitiesField, {
    value,
    onChange,
    entityNames: [],
    label: 'Instruction',
    testIDPrefix: 'test',
  });
}

test('added entities appear below the editor and only their explicit remove control deletes them', () => {
  const view = render(createElement(Editor));
  const input = view.getByRole('textbox');
  const add = view.getByRole('button', { name: 'onboarding:supportingEntitiesAddAction' });
  expect(add.hasAttribute('aria-pressed')).toBe(false);
  expect(add.style.minHeight).toBe('64px');
  fireEvent.input(input, { target: { value: 'Example entity' } });
  fireEvent.click(add);
  const name = view.getByText('Example entity');
  expect(add.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(name);
  expect(view.getByText('Example entity')).toBeTruthy();
  fireEvent.click(
    view.getByRole('button', { name: 'onboarding:supportingEntitiesRemoveAction: Example entity' }),
  );
  expect(view.queryByText('Example entity')).toBeNull();
  fireEvent.input(input, { target: { value: 'Example entity' } });
  fireEvent.click(add);
  fireEvent.input(input, { target: { value: 'Example entity' } });
  fireEvent.click(add);
  expect(view.getAllByText('Example entity').length).toBe(1);
  expect(add.querySelector('[data-selection-active="true"]')).toBeNull();
});

test('Add keeps the shared accessible height without becoming selected', () => {
  fontScale = 2;
  const view = render(createElement(Editor));
  const add = view.getByRole('button', { name: 'onboarding:supportingEntitiesAddAction' });
  expect(add.style.minHeight).toBe('128px');
  fireEvent.click(add);
  expect(view.queryAllByRole('button').length).toBe(1);
});
