import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

let keyboardVisible = false;
const keyboardListeners = new Map<string, Set<() => void>>();
function keyboardEvent(name: string, visible: boolean) {
  keyboardVisible = visible;
  for (const listener of keyboardListeners.get(name) ?? []) listener();
}

let routeParams: { entrance?: string; edit?: string } = {};
mock.module('expo-router', () => ({ useLocalSearchParams: () => routeParams }));

type Layout = (event: { nativeEvent: { layout: { height: number } } }) => void;
let viewportLayout: Layout;
let titleLayout: Layout;
let footerLayout: Layout;
let contentSizeChanged: (width: number, height: number) => void;
let scrollChanged: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
let contentStyle: { paddingTop: number; paddingBottom: number };
const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
// FormScreen reads the reduced-motion setting for its reveal scroll.
mock.module('react-native-reanimated', () => ({ useReducedMotion: () => false }));
mock.module('react-native', () => ({
  Keyboard: {
    isVisible: () => keyboardVisible,
    addListener: (name: string, listener: () => void) => {
      const listeners = keyboardListeners.get(name) ?? new Set();
      listeners.add(listener);
      keyboardListeners.set(name, listeners);
      return { remove: () => listeners.delete(listener) };
    },
  },
  View: box,
  Text: box,
  KeyboardAvoidingView: ({ children, behavior }: { children?: ReactNode; behavior?: string }) =>
    createElement(
      'div',
      { 'data-testid': 'keyboard-container', 'data-behavior': behavior },
      children,
    ),
  useWindowDimensions: () => ({ fontScale: 1 }),
  ScrollView: ({
    children,
    contentContainerStyle,
    scrollEnabled,
    onContentSizeChange,
    onScroll,
  }: {
    children: ReactNode;
    contentContainerStyle: typeof contentStyle;
    scrollEnabled: boolean;
    onContentSizeChange: typeof contentSizeChanged;
    onScroll: typeof scrollChanged;
  }) => {
    contentSizeChanged = onContentSizeChange;
    scrollChanged = onScroll;
    contentStyle = contentContainerStyle;
    return createElement(
      'section',
      { 'data-testid': 'scroll', 'data-scroll-enabled': scrollEnabled },
      children,
    );
  },
}));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/motion/pressable-scale', () => ({ PressableScale: box }));
mock.module('./auth-submit-button', () => ({
  AuthSubmitButton: ({
    label,
    onPress,
    isLoading,
  }: {
    label: string;
    onPress: () => void;
    isLoading?: boolean;
  }) => createElement('button', { onClick: onPress, disabled: isLoading }, label),
}));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  SafeAreaView: ({ children, edges }: { children: ReactNode; edges: string[] }) =>
    createElement('div', { 'data-testid': 'safe-area', 'data-edges': edges.join(',') }, children),
}));
mock.module('expo-blur', () => ({
  BlurTargetView: ({ children, onLayout }: { children: ReactNode; onLayout: Layout }) => {
    viewportLayout = onLayout;
    return box({ children });
  },
}));
mock.module('@/components/layout/content-width', () => ({ FormWidth: box }));
mock.module('./auth-back-button', () => ({
  AuthBackButton: ({ onPress }: { onPress: () => void }) =>
    createElement('button', { 'data-testid': 'shared-back-arrow', onClick: onPress }, 'Back'),
}));
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
  AuthActionFooter: ({
    children,
    onLayout,
    includeBottomInset = true,
  }: {
    children: ReactNode;
    onLayout: Layout;
    includeBottomInset?: boolean;
  }) => {
    footerLayout = onLayout;
    return createElement('footer', { 'data-bottom-inset': includeBottomInset }, children);
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
const { FormScreen } = await import('../layout/form-screen');
const { WizardFrame } = await import('../onboarding/wizard-frame');
const originalOS = process.env.EXPO_OS;
afterAll(() => {
  if (originalOS === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalOS;
});
afterAll(() => mock.restore());
const layout = (height: number) => ({ nativeEvent: { layout: { height } } });

test('login title keeps its anchored place, while footer stays outside scrolling fields', () => {
  process.env.EXPO_OS = 'android';
  const view = render(
    createElement(AuthScreen, {
      title: 'Email login',
      subtitle: 'We will email you a code.',
      children: createElement('input'),
      bottomAction: createElement('button', null, 'Send code'),
    }),
  );
  act(() => {
    viewportLayout(layout(834));
    titleLayout(layout(32));
    footerLayout(layout(130));
  });
  expect(contentStyle).toEqual({ paddingTop: 198, paddingBottom: 154 });
  const action = view.getByRole('button');
  const keyboardContainer = view.getByTestId('keyboard-container');
  expect(keyboardContainer.getAttribute('data-behavior')).toBe('height');
  expect(keyboardContainer.contains(action)).toBe(true);
  expect(keyboardContainer.contains(view.getByTestId('scroll'))).toBe(true);
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
  process.env.EXPO_OS = 'ios';
  view.rerender(createElement(AuthScreen, { children: null, bottomAction: null }));
  expect(keyboardContainer.getAttribute('data-behavior')).toBe('padding');
  view.unmount();
});

for (const os of ['ios', 'android']) {
  test(`wizard uses the shared fixed action and stagger on ${os}`, () => {
    process.env.EXPO_OS = os;
    const onContinue = mock(() => {});
    const onBack = mock(() => {});
    const props = {
      title: 'Welcome',
      onBack,
      stepNumber: 1,
      totalSteps: 3,
      continueLabel: 'Continue',
      onContinue,
      children: createElement('input'),
    };
    const view = render(createElement(WizardFrame, props));
    const action = view.getByRole('button', { name: 'Continue' });
    expect(action.closest('footer')?.getAttribute('data-bottom-inset')).toBe('true');
    expect(view.getByTestId('safe-area').getAttribute('data-edges')).not.toContain('bottom');
    fireEvent.click(view.getByTestId('shared-back-arrow'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('scroll').contains(action)).toBe(false);
    expect(view.getByTestId('keyboard-container').getAttribute('data-behavior')).toBe(
      os === 'ios' ? 'padding' : 'height',
    );
    act(() => {
      viewportLayout(layout(300));
      footerLayout(layout(160));
    });
    expect(contentStyle.paddingTop).toBe(24);
    expect(contentStyle.paddingBottom).toBe(184);
    expect(view.getByText('Welcome').closest('[data-step]')?.getAttribute('data-step')).toBe('0');
    expect(view.getByRole('textbox').closest('[data-step]')?.getAttribute('data-step')).toBe('1');
    expect(action.closest('[data-step]')?.getAttribute('data-step')).toBe('2');
    fireEvent.click(action);
    expect(onContinue).toHaveBeenCalledTimes(1);
    view.rerender(createElement(WizardFrame, { ...props, isContinueBusy: true }));
    fireEvent.click(action);
    expect(onContinue).toHaveBeenCalledTimes(1);
    view.unmount();
  });
}

for (const params of [{ entrance: 'none' }, { edit: '1' }]) {
  test(`returning to a wizard form shows its content immediately: ${JSON.stringify(params)}`, () => {
    routeParams = params;
    const view = render(
      createElement(WizardFrame, {
        title: 'Welcome',
        continueLabel: 'Continue',
        onContinue: () => {},
        children: createElement('input'),
      }),
    );
    expect(view.getByText('Welcome')).toBeTruthy();
    expect(view.getByRole('textbox')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(view.container.querySelector('[data-step]')).toBeNull();
    view.unmount();
    routeParams = {};
  });
}

for (const os of ['ios', 'android']) {
  test(`shared footer removes home-indicator clearance above the keyboard on ${os}`, () => {
    process.env.EXPO_OS = os;
    const props = {
      title: 'Welcome',
      continueLabel: 'Continue',
      onContinue: () => {},
      children: createElement('input'),
    };
    const view = render(createElement(WizardFrame, props));
    const footer = view.getByRole('button', { name: 'Continue' }).closest('footer');
    expect(footer?.getAttribute('data-bottom-inset')).toBe('true');
    act(() => keyboardEvent(os === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', true));
    expect(footer?.getAttribute('data-bottom-inset')).toBe('false');
    expect(contentStyle.paddingBottom).toBe(120);
    act(() => keyboardEvent(os === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', false));
    expect(footer?.getAttribute('data-bottom-inset')).toBe('true');
    expect(contentStyle.paddingBottom).toBe(154);
    view.unmount();
    expect([...keyboardListeners.values()].every((listeners) => listeners.size === 0)).toBe(true);

    keyboardVisible = true;
    const next = render(
      createElement(AuthScreen, {
        children: createElement('input'),
        bottomAction: createElement('button', null, 'Continue'),
      }),
    );
    expect(next.getByRole('button').closest('footer')?.getAttribute('data-bottom-inset')).toBe(
      'false',
    );
    next.unmount();
    keyboardVisible = false;
  });
}

test('revisiting a wizard screen skips the heading, form and CTA entrance together', async () => {
  const { OnboardingEntranceProvider } = await import('../../lib/onboarding-entrance');
  const form = (screenId: 'identity' | 'background') =>
    createElement(
      OnboardingEntranceProvider,
      null,
      createElement(WizardFrame, {
        screenId,
        title: screenId,
        continueLabel: 'Continue',
        onContinue: () => {},
        children: createElement('input'),
      }),
    );
  const view = render(form('identity'));
  expect(view.container.querySelectorAll('[data-step]').length).toBe(3);
  view.rerender(form('background'));
  expect(view.container.querySelectorAll('[data-step]').length).toBe(3);
  routeParams = { entrance: 'none' };
  view.rerender(form('identity'));
  expect(view.container.querySelector('[data-step]')).toBeNull();
  routeParams = {};
  view.rerender(form('background'));
  expect(view.container.querySelector('[data-step]')).toBeNull();
  expect(view.getByRole('textbox')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Continue' })).toBeTruthy();
  view.unmount();
});

test('signature drawing can pause the actual shared scroll container without moving the footer', () => {
  const props = {
    heading: createElement('h1', null, 'Season authorization'),
    children: createElement('div', null, 'Signature pad'),
    bottomAction: createElement('button', null, 'Sign and enter'),
  };
  const view = render(createElement(FormScreen, props));
  expect(view.getByTestId('scroll').getAttribute('data-scroll-enabled')).toBe('true');
  view.rerender(createElement(FormScreen, { ...props, scrollEnabled: false }));
  expect(view.getByTestId('scroll').getAttribute('data-scroll-enabled')).toBe('false');
  expect(view.getByRole('button').closest('footer')).toBeTruthy();
  view.rerender(createElement(FormScreen, { ...props, scrollEnabled: true }));
  expect(view.getByTestId('scroll').getAttribute('data-scroll-enabled')).toBe('true');
});

test('content end is reported only after the last text clears the fixed footer, once', () => {
  const onEndReached = mock(() => {});
  const view = render(
    createElement(FormScreen, {
      heading: createElement('h1', null, 'Read'),
      children: createElement('p', null, 'Document'),
      bottomAction: createElement('button', null, 'Continue'),
      onEndReached,
    }),
  );
  act(() => {
    viewportLayout(layout(600));
    footerLayout(layout(130));
    contentSizeChanged(400, 1200);
  });
  expect(onEndReached).not.toHaveBeenCalled();
  act(() => scrollChanged({ nativeEvent: { contentOffset: { y: 550 } } }));
  expect(onEndReached).not.toHaveBeenCalled();
  act(() => scrollChanged({ nativeEvent: { contentOffset: { y: 600 } } }));
  expect(onEndReached).toHaveBeenCalledTimes(1);
  act(() => scrollChanged({ nativeEvent: { contentOffset: { y: 610 } } }));
  act(() => contentSizeChanged(400, 600));
  expect(onEndReached).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('short documents and collapsed content can reach the visible end without a scroll gesture', () => {
  const onEndReached = mock(() => {});
  const view = render(
    createElement(FormScreen, {
      heading: null,
      children: createElement('p', null, 'Document'),
      bottomAction: null,
      onEndReached,
    }),
  );
  act(() => {
    viewportLayout(layout(600));
    contentSizeChanged(400, 1200);
  });
  expect(onEndReached).not.toHaveBeenCalled();
  act(() => footerLayout(layout(130)));
  expect(onEndReached).not.toHaveBeenCalled();
  act(() => contentSizeChanged(400, 600));
  expect(onEndReached).toHaveBeenCalledTimes(1);
  view.unmount();
  onEndReached.mockClear();
  const short = render(
    createElement(FormScreen, {
      heading: null,
      children: createElement('p', null, 'Short'),
      bottomAction: null,
      onEndReached,
    }),
  );
  act(() => {
    viewportLayout(layout(600));
    footerLayout(layout(130));
    contentSizeChanged(400, 600);
  });
  expect(onEndReached).toHaveBeenCalledTimes(1);
  short.unmount();
});

test('a new document-end subscription can report the currently visible end', () => {
  const firstDocumentEnd = mock(() => {});
  const nextDocumentEnd = mock(() => {});
  const props = { heading: null, children: null, bottomAction: null };
  const view = render(createElement(FormScreen, { ...props, onEndReached: firstDocumentEnd }));
  act(() => {
    viewportLayout(layout(600));
    footerLayout(layout(130));
    contentSizeChanged(400, 600);
  });
  expect(firstDocumentEnd).toHaveBeenCalledTimes(1);
  view.rerender(createElement(FormScreen, { ...props, onEndReached: nextDocumentEnd }));
  expect(nextDocumentEnd).toHaveBeenCalledTimes(1);
  expect(firstDocumentEnd).toHaveBeenCalledTimes(1);
});
