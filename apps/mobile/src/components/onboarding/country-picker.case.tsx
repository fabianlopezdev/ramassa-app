import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import messages from '../../../../../packages/shared/i18n/locales/ca/onboarding.json';

const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
const button = ({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children);
mock.module('react-native', () => ({
  View: box,
  Text: box,
  Pressable: button,
  StyleSheet: { compose: () => ({}) },
  Modal: ({
    children,
    visible,
    onRequestClose,
  }: {
    children: ReactNode;
    visible: boolean;
    onRequestClose: () => void;
  }) =>
    visible
      ? createElement(
          'div',
          { role: 'dialog' },
          children,
          createElement('button', { onClick: onRequestClose }, 'System back'),
        )
      : null,
  FlatList: ({
    data,
    renderItem,
    ListEmptyComponent,
  }: {
    data: { code: string }[];
    renderItem: (props: { item: { code: string } }) => ReactNode;
    ListEmptyComponent: ReactNode;
  }) =>
    createElement(
      'div',
      null,
      data.length
        ? data.map((item) => createElement('div', { key: item.code }, renderItem({ item })))
        : ListEmptyComponent,
    ),
}));
mock.module('react-native-safe-area-context', () => ({ SafeAreaView: box }));
mock.module('expo-symbols', () => ({ SymbolView: () => null }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof messages) => messages[key],
    i18n: { resolvedLanguage: 'ca' },
  }),
}));
mock.module('@/components/auth/app-lock', () => ({ useAppLock: () => ({ isCovered: false }) }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('@/components/motion/pressable-scale', () => ({ PressableScale: button }));
mock.module('@/components/onboarding/onboarding-question-heading', () => ({
  OnboardingQuestionHeading: () => null,
}));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
  }) =>
    createElement('input', {
      'aria-label': label,
      value,
      onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
    }),
}));
const { CountryPicker } = await import('./country-picker');
afterAll(() => mock.restore());

test('one opener replaces suggestions; cancel and system back preserve the selected country', () => {
  const onChange = mock(() => {});
  const view = render(
    createElement(CountryPicker, { label: 'Nacionalitat', value: 'Albània', onChange }),
  );
  expect(view.getAllByRole('button')).toHaveLength(1);
  expect(view.getByText('Albània')).toBeTruthy();
  fireEvent.click(view.getByRole('button'));
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'Canada' } });
  expect(view.getByRole('button', { name: 'Canadà' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: messages.cancelAction }));
  expect(view.queryByRole('dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button'));
  expect((view.getByRole('textbox') as HTMLInputElement).value).toBe('');
  fireEvent.click(view.getByRole('button', { name: 'System back' }));
  expect(view.queryByRole('dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  view.unmount();
});

test('search selects the canonical answer and closes the picker', () => {
  const onChange = mock(() => {});
  const view = render(createElement(CountryPicker, { label: 'Nacionalitat', value: '', onChange }));
  fireEvent.click(view.getByRole('button', { name: /Busca el teu país/ }));
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'Canada' } });
  fireEvent.click(view.getByRole('button', { name: 'Canadà' }));
  expect(onChange).toHaveBeenCalledWith('Canadà');
  expect(view.queryByRole('dialog')).toBeNull();
  view.unmount();
});
