import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const onChoose = mock(async () => undefined);

mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    accessibilityLabel,
    children,
    isSelected,
    onPress,
    testID,
  }: {
    readonly accessibilityLabel: string;
    readonly children: ReactNode;
    readonly isSelected?: boolean;
    readonly onPress: () => void;
    readonly testID?: string;
  }) =>
    createElement(
      'button',
      {
        'aria-label': accessibilityLabel,
        'aria-pressed': isSelected,
        'data-testid': testID,
        onClick: onPress,
      },
      children,
    ),
}));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('react-native', () => ({
  Text: ({ children }: { readonly children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { readonly children: ReactNode }) => createElement('div', null, children),
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
    expect(view.getByRole('button', { name: nativeName })).toBeTruthy();
  }
  expect(view.getByRole('button', { name: 'Català' }).getAttribute('aria-pressed')).toBe('true');

  fireEvent.click(view.getByRole('button', { name: 'العربية' }));
  expect(onChoose).toHaveBeenCalledWith('ar');
});
