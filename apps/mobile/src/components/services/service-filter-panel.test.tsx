import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    readonly accessibilityLabel: string;
    readonly children: ReactNode;
    readonly onPress: () => void;
  }) => createElement('button', { 'aria-label': accessibilityLabel, onClick: onPress }, children),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));
mock.module('react-native', () => ({
  Text: ({ children }: { readonly children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { readonly children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@ramassa/shared/i18n', () => ({
  resolveLocalizedText: (value: { readonly en: string }) => ({ language: 'en', text: value.en }),
  useLanguage: () => ({ language: 'en' }),
}));

const { ServiceFilterPanel } = await import('./service-filter-panel');
const { getServiceCategoryContract } = await import('@ramassa/shared/services');

afterAll(() => mock.restore());

test('a newly filterable category field renders without screen-specific code', () => {
  const fixtureField = {
    key: 'delivery_window',
    label: {
      ca: 'Franja de lliurament',
      es: 'Franja de entrega',
      en: 'Delivery window',
      ar: 'وقت التسليم',
      fa: 'زمان تحویل',
    },
    type: 'select' as const,
    required: false,
    filterable: true,
    options: ['morning', 'evening'],
  };
  const housing = getServiceCategoryContract('housing');
  const view = render(
    createElement(ServiceFilterPanel, {
      contract: { ...housing, filterFields: [...housing.filterFields, fixtureField] },
      availableServices: [
        {
          id: '5eed0000-0000-4000-800a-000000000003',
          zone: 'Osona',
          metadata: { delivery_window: 'morning' },
        } as never,
      ],
      selection: {},
      onChange: () => undefined,
      onClear: () => undefined,
    }),
  );

  expect(view.getByText('Delivery window')).toBeTruthy();
  expect(view.getByRole('button', { name: 'morning' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'evening' })).toBeTruthy();
});
