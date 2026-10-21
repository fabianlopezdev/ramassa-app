import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { IntakeQuestion, QuestionStates } from '@ramassa/shared/intake';
import { EMPTY_INTAKE_CATALOG } from '@ramassa/shared/intake-builder';

mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('react-native', () => ({
  View: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement('div', { 'data-testid': testID }, children),
  Text: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement('span', { 'data-testid': testID }, children),
}));
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
  const onChange = mock((next: QuestionStates) => next);
  const view = render(
    <InviteQuestionsStep
      answered={answered}
      states={{ first_name: 'ask' }}
      onChange={onChange}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  expect(view.getByTestId('invite-question-first_name-status').textContent).toContain(
    'inviteQuestionAsked',
  );
  expect(view.getByTestId('invite-question-last_name-status').textContent).toContain(
    'inviteQuestionNotAsked',
  );
  fireEvent.click(view.getByTestId('invite-question-phone-skip'));
  expect(onChange).toHaveBeenCalledWith({ first_name: 'ask', phone: 'skip' });
});

test("Don't ask is not offered on a required question nobody answered", () => {
  const view = render(
    <InviteQuestionsStep
      answered={answered}
      states={{}}
      onChange={() => undefined}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  expect(view.queryByTestId('invite-question-date_of_birth-skip')).toBeNull();
  expect(view.getByTestId('invite-question-first_name-skip')).not.toBeNull();
});

test('the review preset asks everything', () => {
  const onChange = mock((next: QuestionStates) => next);
  const view = render(
    <InviteQuestionsStep
      answered={answered}
      states={{}}
      onChange={onChange}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  fireEvent.click(view.getByTestId('invite-questions-preset-review'));
  const review = onChange.mock.calls[0]?.[0] ?? {};
  expect(new Set(Object.values(review))).toEqual(new Set(['ask']));
});
