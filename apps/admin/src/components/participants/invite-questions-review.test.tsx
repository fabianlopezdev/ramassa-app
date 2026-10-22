/**
 * The last step of creating a participant (RAPP-618): what she will be asked,
 * from what staff entered, with the RAPP-301 choices.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { IntakeQuestion, QuestionStates } from '@ramassa/shared/intake';
import { EMPTY_INTAKE_CATALOG, type IntakeCatalog } from '@ramassa/shared/intake-builder';
import { InviteQuestionsReview } from './invite-questions-review';

const answered = new Set<IntakeQuestion>(['first_name', 'last_name']);

function row(view: ReturnType<typeof render>, question: string): HTMLElement {
  return view.getByTestId(`invite-question-${question}`);
}

function choice(view: ReturnType<typeof render>, question: string): HTMLSelectElement {
  const element = view.container.querySelector<HTMLSelectElement>(`#invite-question-${question}`);
  if (element === null) throw new Error(`no ${question} choice`);
  return element;
}

test('an answered question is not asked on Auto, an unanswered one is', () => {
  const view = render(
    <InviteQuestionsReview
      answered={answered}
      states={{}}
      onChange={() => undefined}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  expect(row(view, 'first_name').dataset.asked).toBe('false');
  expect(row(view, 'date_of_birth').dataset.asked).toBe('true');
});

test('Ask on an answered question makes it asked; the change goes to the caller', () => {
  const onChange = mock((next: QuestionStates) => next);
  const view = render(
    <InviteQuestionsReview
      answered={answered}
      states={{ first_name: 'ask' }}
      onChange={onChange}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  expect(row(view, 'first_name').dataset.asked).toBe('true');
  fireEvent.change(choice(view, 'phone'), { target: { value: 'skip' } });
  expect(onChange).toHaveBeenCalledWith({ first_name: 'ask', phone: 'skip' });
  fireEvent.change(choice(view, 'first_name'), { target: { value: 'auto' } });
  expect(onChange).toHaveBeenLastCalledWith({});
});

test("Don't ask is not offered on a required question nobody answered, and says why", () => {
  const view = render(
    <InviteQuestionsReview
      answered={answered}
      states={{}}
      onChange={() => undefined}
      catalog={EMPTY_INTAKE_CATALOG}
    />,
  );
  const skip = (question: string) =>
    choice(view, question).querySelector<HTMLOptionElement>('option[value="skip"]');
  expect(skip('date_of_birth')?.disabled).toBe(true);
  expect(choice(view, 'date_of_birth').getAttribute('aria-describedby')).toBe(
    'invite-question-date_of_birth-hint',
  );
  expect(skip('first_name')?.disabled).toBe(false);
  expect(skip('phone')?.disabled).toBe(false);
});

test('the presets fill every choice, the organization ones too', () => {
  const onChange = mock((next: QuestionStates) => next);
  const catalog: IntakeCatalog = {
    ...EMPTY_INTAKE_CATALOG,
    presets: [{ id: 'p1', name: 'Sizes only', states: { clothing_size: 'ask' } }],
  };
  const view = render(
    <InviteQuestionsReview answered={answered} states={{}} onChange={onChange} catalog={catalog} />,
  );
  fireEvent.click(view.getByText(/questionStatesPresetReview|reviews everything/));
  const review = onChange.mock.calls[0]?.[0] ?? {};
  expect(new Set(Object.values(review))).toEqual(new Set(['ask']));
  fireEvent.click(view.getByText('Sizes only'));
  expect(onChange).toHaveBeenLastCalledWith({ clothing_size: 'ask' });
});

test('a question removed in Settings is never asked and cannot be changed', () => {
  const catalog: IntakeCatalog = {
    ...EMPTY_INTAKE_CATALOG,
    overrides: [
      { question: 'phone', label: null, help: null, isHidden: true, optionOverrides: {} },
    ],
  };
  const view = render(
    <InviteQuestionsReview
      answered={answered}
      states={{ phone: 'ask' }}
      onChange={() => undefined}
      catalog={catalog}
    />,
  );
  expect(row(view, 'phone').dataset.asked).toBe('false');
  expect(choice(view, 'phone').disabled).toBe(true);
});

test('staff screens are listed in the order her phone shows them (RAPP-612)', () => {
  const screen = (id: string, afterScreen: 'identity' | 'logistics' | 'season') => ({
    id,
    title: { ca: id },
    intro: null,
    afterScreen,
    isArchived: false,
    questions: [
      {
        id: `${id}-question`,
        screenId: id,
        type: 'short_text' as const,
        label: { ca: `Pregunta ${id}` },
        help: null,
        privacy: 'normal' as const,
        placements: ['wizard' as const],
        isArchived: false,
        settings: {},
        options: [],
      },
    ],
  });
  // The catalog lists screens by their anchor: C2 first.
  const catalog: IntakeCatalog = {
    ...EMPTY_INTAKE_CATALOG,
    screens: [screen('C2', 'identity'), screen('C1', 'logistics'), screen('C3', 'season')],
    flowOrder: ['custom:C1', 'custom:C2', 'custom:C3', 'identity'],
  };
  const view = render(
    <InviteQuestionsReview
      answered={answered}
      states={{}}
      onChange={() => undefined}
      catalog={catalog}
    />,
  );
  const listed = [
    ...view.container.querySelectorAll('[data-testid^="invite-custom-question-"]'),
  ].map((element) => element.getAttribute('data-testid'));
  expect(listed).toEqual([
    'invite-custom-question-C1-question',
    'invite-custom-question-C2-question',
    'invite-custom-question-C3-question',
  ]);
});
