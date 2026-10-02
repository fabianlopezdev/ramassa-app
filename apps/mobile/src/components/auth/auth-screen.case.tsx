import { act, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

type Layout = (event: { nativeEvent: { layout: { height: number } } }) => void;
let viewportLayout: Layout;
let titleLayout: Layout;
let footerLayout: Layout;
let contentStyle: { paddingTop: number; paddingBottom: number };
const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
mock.module('react-native', () => ({
  View: box,
  KeyboardAvoidingView: box,
  useWindowDimensions: () => ({ fontScale: 1 }),
  ScrollView: ({
    children,
    contentContainerStyle,
  }: {
    children: ReactNode;
    contentContainerStyle: typeof contentStyle;
  }) => {
    contentStyle = contentContainerStyle;
    return createElement('section', { 'data-testid': 'scroll' }, children);
  },
}));
mock.module('react-native-safe-area-context', () => ({ SafeAreaView: box }));
mock.module('expo-blur', () => ({
  BlurTargetView: ({ children, onLayout }: { children: ReactNode; onLayout: Layout }) => {
    viewportLayout = onLayout;
    return box({ children });
  },
}));
mock.module('@/components/layout/content-width', () => ({ FormWidth: box }));
mock.module('./auth-back-button', () => ({ AuthBackButton: () => null }));
mock.module('./auth-title', () => ({
  AuthTitle: ({
    title,
    subtitle,
    onTitleLayout,
  }: {
    title: string;
    subtitle: string;
    onTitleLayout: Layout;
  }) => {
    titleLayout = onTitleLayout;
    return createElement('header', null, createElement('h1', null, title), subtitle);
  },
}));
mock.module('./auth-action-footer', () => ({
  AuthActionFooter: ({ children, onLayout }: { children: ReactNode; onLayout: Layout }) => {
    footerLayout = onLayout;
    return createElement('footer', null, children);
  },
}));
mock.module('@/components/motion/fade-slide-in', () => ({
  FadeSlideIn: ({
    children,
    index,
    composite,
  }: {
    children: ReactNode;
    index: number;
    composite: boolean;
  }) => createElement('div', { 'data-step': index, 'data-composite': composite }, children),
}));
const { AuthScreen } = await import('./auth-screen');
afterAll(() => mock.restore());
const layout = (height: number) => ({ nativeEvent: { layout: { height } } });

test('login title shares the choice heading anchor, while footer stays outside scrolling fields', () => {
  const view = render(
    createElement(AuthScreen, {
      title: 'Email login',
      subtitle: 'We will email you a code.',
      children: createElement('input'),
      bottomAction: createElement('button', null, 'Send code'),
    }),
  );
  act(() => {
    viewportLayout(layout(800));
    titleLayout(layout(32));
    footerLayout(layout(96));
  });
  expect(contentStyle).toEqual({ paddingTop: 198, paddingBottom: 120 });
  const action = view.getByRole('button');
  expect(action.closest('footer')).toBeTruthy();
  expect(view.getByTestId('scroll').contains(action)).toBe(false);
  expect(view.getByRole('heading').closest('[data-step]')?.getAttribute('data-step')).toBe('0');
  expect(view.getByRole('textbox').closest('[data-step]')?.getAttribute('data-step')).toBe('1');
  expect(action.closest('[data-step]')?.getAttribute('data-step')).toBe('2');
  act(() => {
    viewportLayout(layout(300));
    titleLayout(layout(96));
    footerLayout(layout(160));
  });
  expect(contentStyle).toEqual({ paddingTop: 24, paddingBottom: 184 });
});
