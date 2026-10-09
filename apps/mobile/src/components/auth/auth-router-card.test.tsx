import { fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

const onPress = mock(() => undefined);
mock.module('./auth-choice-icon', () => ({
  AuthChoiceIcon: () => createElement('span', null),
}));

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
mock.module('@/components/motion/pressable-depth', () => ({
  PressableDepth: ({
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
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('expo-symbols', () => ({ SymbolView: () => createElement('span', null) }));
mock.module('nativewind', () => ({ cssInterop: (component: unknown) => component }));
mock.module('react-native', () => ({
  Text: ({ children }: { readonly children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { readonly children: ReactNode }) => createElement('div', null, children),
}));

const { AuthRouterCard } = await import('./auth-router-card');

afterAll(() => mock.restore());

test.each(['default', 'brand'] as const)(
  '%s card announces its content and routes in one tap',
  (variant) => {
    onPress.mockClear();
    const view = render(
      createElement(AuthRouterCard, {
        variant,
        solarIcon: variant === 'brand' ? 'user-plus' : undefined,
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
  },
);
