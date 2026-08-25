import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const onPress = mock(() => undefined);

mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    accessibilityLabel,
    children,
    onPress: handlePress,
  }: {
    readonly accessibilityLabel: string;
    readonly children: ReactNode;
    readonly onPress: () => void;
  }) =>
    createElement('button', { 'aria-label': accessibilityLabel, onClick: handlePress }, children),
}));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('expo-symbols', () => ({ SymbolView: () => createElement('span', null) }));
mock.module('react-native', () => ({
  Text: ({ children }: { readonly children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { readonly children: ReactNode }) => createElement('div', null, children),
}));

const { AuthRouterCard } = await import('./auth-router-card');

afterAll(() => mock.restore());

test('announces the label and situation together and routes in one tap', () => {
  const view = render(
    createElement(AuthRouterCard, {
      label: 'Amb un codi',
      subline: "No tinc correu; l'equip m'ha donat un codi",
      symbol: { ios: 'key.fill', android: 'key', web: 'key' },
      onPress,
    }),
  );

  const card = view.getByRole('button', {
    name: "Amb un codi. No tinc correu; l'equip m'ha donat un codi",
  });
  fireEvent.click(card);
  expect(onPress).toHaveBeenCalledTimes(1);
});
