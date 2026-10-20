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
  useWindowDimensions: () => ({ fontScale: 1 }),
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
const { MunicipalityPicker } = await import('./municipality-picker');
afterAll(() => mock.restore());

test('one municipality field replaces suggested cities; cancel and system back preserve the value', () => {
  const onChange = mock(() => {});
  const view = render(
    createElement(MunicipalityPicker, { label: 'Municipi', value: 'Granollers', onChange }),
  );
  expect(view.getAllByRole('button')).toHaveLength(1);
  expect(view.queryByText(messages.municipalityOptionalHint) === null).toBe(true);
  expect(view.queryByRole('button', { name: 'Barcelona' })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Municipi: Granollers' }));
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'Granollers' } });
  expect(view.getByRole('button', { name: 'Granollers' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: messages.cancelAction }));
  expect(view.queryByRole('dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: 'Municipi: Granollers' }));
  expect((view.getByRole('textbox') as HTMLInputElement).value).toBe('');
  fireEvent.click(view.getByRole('button', { name: 'System back' }));
  expect(view.queryByRole('dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  view.unmount();
});

test('a blank municipality is neutral and an existing selection can be cleared inside the picker', () => {
  const onChange = mock(() => {});
  const view = render(
    createElement(MunicipalityPicker, { label: 'Municipi', value: '', onChange }),
  );
  fireEvent.click(
    view.getByRole('button', { name: `Municipi: ${messages.searchMunicipalityPlaceholder}` }),
  );
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'Granollers' } });
  fireEvent.click(view.getByRole('button', { name: 'Granollers' }));
  expect(onChange).toHaveBeenCalledWith('Granollers');
  expect(view.queryByRole('dialog')).toBeNull();
  expect(view.queryByText(messages.municipalityNone) === null).toBe(true);
  view.rerender(
    createElement(MunicipalityPicker, { label: 'Municipi', value: 'Granollers', onChange }),
  );
  fireEvent.click(view.getByRole('button', { name: 'Municipi: Granollers' }));
  fireEvent.click(view.getByRole('button', { name: messages.clearMunicipalityAction }));
  expect(onChange).toHaveBeenLastCalledWith('');
  expect(view.queryByRole('dialog')).toBeNull();
  view.unmount();
});
