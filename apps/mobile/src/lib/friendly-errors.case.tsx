import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { AppError } from '@ramassa/shared/errors';
import ar from '../../../../packages/shared/i18n/locales/ar/errors.json';
import ca from '../../../../packages/shared/i18n/locales/ca/errors.json';
import en from '../../../../packages/shared/i18n/locales/en/errors.json';
import es from '../../../../packages/shared/i18n/locales/es/errors.json';
import fa from '../../../../packages/shared/i18n/locales/fa/errors.json';

let catalog = en;
const report = mock(() => undefined);
const announce = mock(() => undefined);
type NativeProps = {
  children?: ReactNode;
  accessibilityRole?: string;
  accessibilityLiveRegion?: string;
};
const View = ({ children, accessibilityRole, accessibilityLiveRegion }: NativeProps) =>
  createElement(
    'div',
    {
      role: accessibilityRole,
      'aria-live': accessibilityLiveRegion as 'polite' | 'assertive' | undefined,
    },
    children,
  );
mock.module('react-native', () => ({
  View,
  Text: View,
  AccessibilityInfo: {
    announceForAccessibility: announce,
    announceForAccessibilityWithOptions: announce,
  },
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => catalog[key.replace('errors:', '') as keyof typeof en],
  }),
}));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/observability', () => ({ logger: { error: report } }));
mock.module('@/components/motion/shake-on-error', () => ({ ShakeOnError: View }));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({ children, onPress }: { children: ReactNode; onPress: () => void }) =>
    createElement('button', { onClick: onPress }, children),
}));
const { AuthFormError } = await import('../components/auth/auth-form-error');
const { FailureNotice } = await import('../components/error-code-line');
const { ErrorFallback } = await import('../components/error-fallback');
afterEach(cleanup);

test('every language renders account guidance and no technical code', () => {
  for (const messages of [ca, es, en, ar, fa]) {
    catalog = messages;
    for (const code of ['AUTH-1', 'AUTH-10', 'AUTH-11', 'NETWORK-1', 'AUTH-5'] as const) {
      const view = render(createElement(AuthFormError, { code }));
      expect(view.getByRole('alert').textContent).toBe(messages[code]);
      expect(view.container.textContent).not.toMatch(/AUTH-\d|NETWORK-\d|Signups not allowed/);
      view.unmount();
    }
  }
});

test('action failures and boundary failures hide codes, preserve retry and diagnostics', () => {
  catalog = en;
  const notice = render(
    createElement(FailureNotice, { code: 'UPLOAD-1', message: en['UPLOAD-1'] }),
  );
  expect(notice.container.textContent).toBe(en['UPLOAD-1']);
  notice.unmount();
  const error = new AppError('AUTH-10', {
    message: 'Signups not allowed for otp',
    context: { authCode: 'otp_disabled', status: 422 },
  });
  const retry = mock(() => undefined);
  const boundary = render(createElement(ErrorFallback, { error, retry }));
  expect(boundary.container.textContent).toContain(en['AUTH-10']);
  expect(boundary.container.textContent).not.toMatch(/AUTH-10|otp_disabled|Signups not allowed/);
  expect(report).toHaveBeenCalledWith('error boundary rendered', { error, code: 'AUTH-10' });
  fireEvent.click(boundary.getByRole('button'));
  expect(retry).toHaveBeenCalledTimes(1);
});
