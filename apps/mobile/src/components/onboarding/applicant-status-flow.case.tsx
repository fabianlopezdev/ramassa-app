import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { createInMemoryOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';

const store = createInMemoryOnboardingDraftStore();
const push = mock(() => {});
const replace = mock(() => {});
const goNext = mock(() => {});
mock.module('@/lib/onboarding', () => ({ onboardingDraftStore: store }));
mock.module('expo-router', () => ({ useRouter: () => ({ push, replace }), Redirect: () => null }));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('@/lib/onboarding-intake-context', () => ({
  useBuiltinWording: () => ({}),
  useWizardStep: () => ({
    position: { step: 9, total: 13 },
    isEditing: false,
    shouldAsk: () => true,
    nextDraftStep: 'supporting-entities',
    goNext,
    goBack: () => {},
    previousDraftStep: 'season',
  }),
}));
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({
    title,
    intro,
    children,
    onContinue,
    onBack,
  }: {
    title: string;
    intro?: string;
    children: ReactNode;
    onContinue: () => void;
    onBack: () => void;
  }) =>
    createElement(
      'section',
      null,
      createElement('h1', null, title),
      intro ? createElement('p', null, intro) : null,
      children,
      createElement('button', { onClick: onContinue }, 'Continue'),
      createElement('button', { onClick: onBack }, 'Back'),
    ),
}));
mock.module('@/components/profile/season-answer-fields', () => ({
  EMPTY_SEASON_ANSWERS: {},
  SeasonAnswerFields: ({ onChange }: { onChange: (patch: { applicantStatus: string }) => void }) =>
    createElement('button', { onClick: () => onChange({ applicantStatus: 'other' }) }, 'Other'),
}));
mock.module('@/components/forms/form-text-area', () => ({
  FormTextArea: ({
    value,
    onChangeText,
    maxLength,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    maxLength: number;
  }) =>
    createElement('textarea', {
      value,
      maxLength,
      onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
      'aria-label': 'Details',
    }),
}));
const { SeasonWizardStep } = await import('./season-wizard-step');
const { default: Details } = await import('../../app/(app)/onboarding/applicant-status-details');
afterAll(() => mock.restore());
beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  goNext.mockClear();
});

test('a situation other than Other goes directly to the next main screen', () => {
  store.saveDraft({
    currentStep: 'season',
    season: { applicantStatus: 'migrant', applicantStatusDetails: 'Stale' },
  });
  const picker = render(createElement(SeasonWizardStep, { screen: 'season' }));
  fireEvent.click(picker.getByRole('button', { name: 'Continue' }));
  expect(push).not.toHaveBeenCalled();
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(store.loadDraft()?.currentStep).toBe('supporting-entities');
  expect(store.loadDraft()?.season?.applicantStatusDetails).toBeUndefined();
  picker.unmount();
});

test('Other opens its explanation on Continue, and Back preserves text in the same question', () => {
  store.saveDraft({
    currentStep: 'season',
    season: { applicantStatus: 'migrant', specificNeeds: 'Quiet room' },
  });
  const picker = render(createElement(SeasonWizardStep, { screen: 'season' }));
  expect(picker.queryByText('seasonStepIntro')).toBeNull();
  fireEvent.click(picker.getByRole('button', { name: 'Other' }));
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(picker.getByRole('button', { name: 'Continue' }));
  expect(push).toHaveBeenCalledWith('/onboarding/applicant-status-details');
  expect(store.loadDraft()?.currentStep).toBe('applicant-status-details');
  picker.unmount();
  const details = render(createElement(Details));
  const input = details.getByRole('textbox', { name: 'Details' }) as HTMLTextAreaElement;
  expect(input.maxLength).toBe(2000);
  fireEvent.input(input, { target: { value: 'Example situation' } });
  fireEvent.click(details.getByRole('button', { name: 'Back' }));
  expect(store.loadDraft()?.season?.applicantStatusDetails).toBe('Example situation');
  expect(store.loadDraft()?.season?.specificNeeds).toBe('Quiet room');
  expect(replace).toHaveBeenCalledWith('/onboarding/season?entrance=none');
  details.unmount();
  const reopened = render(createElement(Details));
  expect((reopened.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Example situation');
  fireEvent.click(reopened.getByRole('button', { name: 'Continue' }));
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(store.loadDraft()?.currentStep).toBe('supporting-entities');
  reopened.unmount();
});
