import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import ca from '../../../../packages/shared/i18n/locales/ca/onboarding.json';

const next = mock(() => undefined);
const save = mock(() => undefined);
const countryTap = mock(() => undefined);
const load = () => ({
  identity: {
    firstName: 'Laia',
    lastName: 'Coromines',
    day: '90',
    month: '13',
    year: '1666',
    placeOfBirth: 'Barcelona',
    nationality: 'Espanya',
    preferredLanguage: 'ca',
  },
});
const Box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
mock.module('react-native', () => ({
  Text: Box,
  View: Box,
  AccessibilityInfo: { announceForAccessibilityWithOptions: () => undefined },
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ca[key as keyof typeof ca] ?? key,
    i18n: { resolvedLanguage: 'ca' },
  }),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => undefined }));
mock.module('@/lib/onboarding', () => ({
  onboardingDraftStore: { loadDraft: load, saveDraft: save },
}));
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardStep: () => ({
    position: { step: 2, total: 8 },
    shouldAsk: () => true,
    nextDraftStep: 'documentation',
    goNext: next,
    goBack: null,
  }),
  useBuiltinWording: () => ({
    label: (_key: string, fallback: string) => fallback,
    help: () => null,
  }),
}));
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({
    title,
    intro,
    children,
    onContinue,
    continueLabel,
  }: {
    title: string;
    intro?: string;
    children: ReactNode;
    onContinue: () => void;
    continueLabel: string;
  }) =>
    createElement(
      'main',
      null,
      createElement('h1', null, title),
      intro,
      children,
      createElement('button', { onClick: onContinue }, continueLabel),
    ),
}));
mock.module('@/components/onboarding/question-help', () => ({ QuestionHelp: () => null }));
mock.module('@/components/onboarding/wizard-validation-summary', () => ({
  WizardValidationSummary: () => null,
}));
mock.module('@/components/onboarding/country-picker', () => ({
  CountryPicker: ({ label, value, symbol }: { label: string; value: string; symbol?: unknown }) =>
    createElement(
      'button',
      { 'aria-label': label, 'data-has-icon': Boolean(symbol), onClick: countryTap },
      value,
    ),
}));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
    onBlur,
    isInvalid,
    accessibilityHint,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    onBlur: () => void;
    isInvalid?: boolean;
    accessibilityHint?: string;
  }) =>
    createElement('input', {
      'aria-label': label,
      value,
      'aria-invalid': Boolean(isInvalid),
      'aria-description': accessibilityHint,
      onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
      onBlur,
    }),
}));
const { default: Background } = await import('../app/(app)/onboarding/background');
afterEach(cleanup);
beforeEach(() => {
  next.mockClear();
  save.mockClear();
  countryTap.mockClear();
});

test('subtitle and icon are absent, country still opens on tap', () => {
  const view = render(createElement(Background));
  expect(view.queryByText(ca.backgroundIntro)).toBeNull();
  const country = view.getByRole('button', { name: ca.nationalityLabel });
  expect(country.getAttribute('data-has-icon')).toBe('false');
  fireEvent.click(country);
  expect(countryTap).toHaveBeenCalledTimes(1);
});

test('invalid saved dates show feedback on blur, block Continue, and clear after correction', async () => {
  const view = render(createElement(Background));
  fireEvent.blur(view.getByRole('textbox', { name: ca.dayLabel }));
  await waitFor(() => expect(view.getByText(ca.errorBirthDayRange)).toBeTruthy());
  expect(view.getByRole('textbox', { name: ca.dayLabel }).getAttribute('aria-invalid')).toBe(
    'true',
  );
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(view.getByText(ca.errorBirthDayRange)).toBeTruthy());
  expect(view.getByRole('textbox', { name: ca.monthLabel }).getAttribute('aria-description')).toBe(
    ca.errorBirthMonthRange,
  );
  expect(view.getByRole('textbox', { name: ca.yearLabel }).getAttribute('aria-description')).toBe(
    ca.errorBirthYear,
  );
  expect(view.getByText(ca.errorBirthMonthRange)).toBeTruthy();
  expect(view.getByText(ca.errorBirthYear)).toBeTruthy();
  expect(next).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  fireEvent.input(view.getByRole('textbox', { name: ca.dayLabel }), { target: { value: '1' } });
  fireEvent.input(view.getByRole('textbox', { name: ca.monthLabel }), { target: { value: '1' } });
  fireEvent.blur(view.getByRole('textbox', { name: ca.monthLabel }));
  await waitFor(() => {
    expect(view.getByText(ca.errorBirthYear)).toBeTruthy();
    expect(view.queryByText(ca.errorBirthDayRange)).toBeNull();
    expect(view.queryByText(ca.errorBirthMonthRange)).toBeNull();
  });
  for (const [label, value] of [
    [ca.dayLabel, '29'],
    [ca.monthLabel, '2'],
    [ca.yearLabel, '1995'],
  ]) {
    fireEvent.input(view.getByRole('textbox', { name: label }), { target: { value } });
  }
  fireEvent.blur(view.getByRole('textbox', { name: ca.yearLabel }));
  await waitFor(() => expect(view.getByText(ca.errorBirthDayInMonth)).toBeTruthy());
  fireEvent.input(view.getByRole('textbox', { name: ca.yearLabel }), { target: { value: '2000' } });
  fireEvent.blur(view.getByRole('textbox', { name: ca.yearLabel }));
  await waitFor(() => expect(view.queryByText(ca.errorBirthDayInMonth)).toBeNull());
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledTimes(1);
});
