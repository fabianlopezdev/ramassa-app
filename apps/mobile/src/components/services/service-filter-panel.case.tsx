import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

// The raised pill and the raised button (RAPP-878), as plain buttons.
mock.module('@/components/layout/filter-chips', () => ({
  RaisedChip: ({
    label,
    accessibilityHint,
    onPress,
  }: {
    readonly label: string;
    readonly accessibilityHint?: string;
    readonly onPress: () => void;
  }) =>
    createElement(
      'button',
      { 'aria-label': label, 'aria-description': accessibilityHint, onClick: onPress },
      label,
    ),
}));
mock.module('@/components/forms/raised-action-button', () => ({
  RaisedActionButton: ({
    label,
    onPress,
  }: {
    readonly label: string;
    readonly onPress: () => void;
  }) => createElement('button', { 'aria-label': label, onClick: onPress }, label),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));
mock.module('react-native', () => ({
  StyleSheet: { compose: (first: unknown, second: unknown) => [first, second] },
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
  expect(view.getByRole('button', { name: 'morning' }).getAttribute('aria-description')).toBe(
    'Delivery window',
  );
  expect(view.getByRole('button', { name: 'evening' })).toBeTruthy();
});
