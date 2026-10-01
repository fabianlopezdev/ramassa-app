import { act, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type CSSProperties, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  createI18n,
  createInMemoryLanguageStorage,
  SUPPORTED_LANGUAGES,
} from '@ramassa/shared/i18n';

type LayoutHandler = (event: { nativeEvent: { layout: { height: number } } }) => void;
const measurements = new Map<string, LayoutHandler>();
mock.module('react-native', () => ({
  useWindowDimensions: () => ({ fontScale: 1 }),
  View: ({
    children,
    style,
    testID,
  }: {
    children: ReactNode;
    style: CSSProperties;
    testID?: string;
  }) => createElement('div', { style, 'data-testid': testID }, children),
  Text: ({
    children,
    onLayout,
    accessibilityLanguage,
    accessibilityElementsHidden,
  }: {
    children: ReactNode;
    onLayout: LayoutHandler;
    accessibilityLanguage: string;
    accessibilityElementsHidden: boolean;
  }) => {
    measurements.set(accessibilityLanguage, onLayout);
    return createElement('h1', { 'aria-hidden': accessibilityElementsHidden }, children);
  },
}));
mock.module('@/components/motion/fade-slide-in', () => ({
  FadeSlideIn: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/components/motion/selection-transition', () => ({
  SelectionTransition: ({ children, active }: { children?: ReactNode; active: boolean }) =>
    createElement('div', { 'aria-hidden': !active }, children),
}));
const { LanguageChoiceHeading } = await import('./language-choice-heading');
afterAll(() => mock.restore());

test('reserves the tallest script before selection and exposes only the active heading', async () => {
  const i18n = createI18n({
    languageStorage: createInMemoryLanguageStorage(),
    deviceLanguages: ['en'],
  });
  const view = render(
    createElement(I18nextProvider, { i18n }, createElement(LanguageChoiceHeading)),
  );
  expect([...measurements.keys()].sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  // Native font metrics, including a taller Arabic line and a wrapped Farsi title.
  act(() => {
    for (const [language, height] of Object.entries({ ca: 29, es: 29, en: 29, ar: 58, fa: 84 })) {
      measurements.get(language)!({ nativeEvent: { layout: { height } } });
    }
  });
  const reservedHeight = view.getByTestId('language-heading').style.height;
  expect(reservedHeight).toBe('84px');
  for (const language of SUPPORTED_LANGUAGES) {
    await act(() => i18n.changeLanguage(language).then(() => undefined));
    expect(view.getByTestId('language-heading').style.height).toBe(reservedHeight);
    expect(view.getAllByRole('heading').length).toBe(1);
    expect(view.getByRole('heading').textContent).toBe(i18n.t('auth:languageTitle'));
  }
  // A larger accessibility font or narrower viewport can grow the reserved slot.
  act(() => measurements.get('ar')!({ nativeEvent: { layout: { height: 132 } } }));
  expect(view.getByTestId('language-heading').style.height).toBe('132px');
});
