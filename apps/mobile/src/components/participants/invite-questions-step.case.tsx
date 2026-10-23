import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { IntakeQuestion } from '@ramassa/shared/intake';
import {
  EMPTY_INTAKE_CATALOG,
  NO_CHOICES,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';

mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('react-native', () => ({
  View: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement('div', { 'data-testid': testID }, children),
  Text: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement('span', { 'data-testid': testID }, children),
  Pressable: ({
    children,
    testID,
    onPress,
  }: {
    children: ReactNode;
    testID?: string;
    onPress?: () => void;
  }) => createElement('button', { 'data-testid': testID, onClick: onPress }, children),
  Switch: ({ testID }: { testID?: string }) => createElement('input', { 'data-testid': testID }),
}));
mock.module('@/components/forms/data-icon', () => ({ BrandSymbol: () => null }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => undefined }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@ramassa/shared/i18n', () => ({ useLanguage: () => ({ language: 'ca' }) }));
mock.module('@/components/equipment/choice-option', () => ({
  ChoiceOption: ({
    testID,
    label,
    value,
    selected,
    onSelect,
  }: {
    testID: string;
    label: string;
    value: string;
    selected: boolean;
    onSelect: (value: string) => void;
  }) =>
    createElement(
      'button',
      { 'data-testid': testID, 'aria-pressed': selected, onClick: () => onSelect(value) },
      label,
    ),
}));

const { InviteQuestionsStep } = await import('./invite-questions-step');
const answered = new Set<IntakeQuestion>(['first_name', 'last_name']);

test('shows what she is asked, as her phone plans it, and changes a question (RAPP-618)', () => {
  const onChange = mock((next: PlayerChoices) => next);
  const view = render(
    <InviteQuestionsStep
      answered={answered}
      choices={{ states: { first_name: 'ask' }, customStates: {} }}
      onChange={onChange}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  // A screen opens to its questions (RAPP-644).
  fireEvent.click(view.getByTestId('invite-screen-open-identity'));
  expect(view.getByTestId('invite-question-first_name-status').textContent).toContain(
    'inviteQuestionAsked',
  );
  // Her name screen shows both names, so asking one asks the other too.
  expect(view.getByTestId('invite-question-last_name-status').textContent).toContain(
    'inviteQuestionAsked',
  );
  fireEvent.click(view.getByTestId('invite-screen-open-logistics'));
  expect(view.getByTestId('invite-question-reference_contact_name-status').textContent).toContain(
    'inviteQuestionAskedWhenItApplies',
  );
  fireEvent.click(view.getByTestId('invite-question-phone-skip'));
  expect(onChange).toHaveBeenCalledWith({
    states: { first_name: 'ask', phone: 'skip' },
    customStates: {},
  });
});

test("Don't ask is not offered on a required question nobody answered", () => {
  const view = render(
    <InviteQuestionsStep
      answered={answered}
      choices={NO_CHOICES}
      onChange={() => undefined}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  fireEvent.click(view.getByTestId('invite-screen-open-background'));
  expect(view.queryByTestId('invite-question-date_of_birth-skip')).toBeNull();
  fireEvent.click(view.getByTestId('invite-screen-open-identity'));
  expect(view.getByTestId('invite-question-first_name-skip')).not.toBeNull();
});

test('the review preset asks everything', () => {
  const onChange = mock((next: PlayerChoices) => next);
  const view = render(
    <InviteQuestionsStep
      answered={answered}
      choices={NO_CHOICES}
      onChange={onChange}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  fireEvent.click(view.getByTestId('invite-questions-preset-review'));
  const review = onChange.mock.calls[0]?.[0] ?? NO_CHOICES;
  expect(new Set(Object.values(review.states))).toEqual(new Set(['ask']));
});
