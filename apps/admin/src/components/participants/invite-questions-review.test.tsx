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

/**
 * The question's row, in the sheet of the screen card that asks it (RAPP-643):
 * the cards open one sheet at a time, so each is opened until one holds it.
 */
function questionRow(view: ReturnType<typeof render>, question: string): HTMLElement {
  for (const open of view.queryAllByTestId(/^invite-screen-open-/)) {
    fireEvent.click(open);
    const found = view.queryByTestId(`invite-question-${question}`);
    if (found !== null) return found;
  }
  throw new Error(`no screen asks ${question}`);
}

function choiceButton(row: HTMLElement, state: 'auto' | 'ask' | 'skip'): HTMLButtonElement {
  const button = row.querySelector<HTMLButtonElement>(`[data-testid$="-${state}"]`);
  if (button === null) throw new Error(`no ${state} choice`);
  return button;
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
  expect(questionRow(view, 'first_name').dataset.asking).toBe('not-asked');
  expect(questionRow(view, 'date_of_birth').dataset.asking).toBe('asked');
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
  expect(questionRow(view, 'first_name').dataset.asking).toBe('asked');
  fireEvent.click(choiceButton(questionRow(view, 'phone'), 'skip'));
  expect(onChange).toHaveBeenCalledWith({ first_name: 'ask', phone: 'skip' });
  fireEvent.click(choiceButton(questionRow(view, 'first_name'), 'auto'));
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
  const birth = questionRow(view, 'date_of_birth');
  expect(choiceButton(birth, 'skip').disabled).toBe(true);
  expect(birth.textContent).toContain('questionStatesRequiredHint');
  expect(choiceButton(questionRow(view, 'first_name'), 'skip').disabled).toBe(false);
  expect(choiceButton(questionRow(view, 'phone'), 'skip').disabled).toBe(false);
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
  // Its screen still asks her the other questions; the removed one has no row to change.
  expect(questionRow(view, 'address').dataset.asking).toBe('asked');
  expect(view.queryByTestId('invite-question-phone')).toBeNull();
  expect(() => questionRow(view, 'phone')).toThrow('no screen asks phone');
});

test('staff screens are listed in the order her phone shows them (RAPP-612)', () => {
  const screen = (id: string, afterScreen: 'identity' | 'logistics' | 'season') => ({
    id,
    title: { ca: id },
    intro: null,
    afterScreen,
    isArchived: false,
  });
  const field = (id: string) => ({
    id: `${id}-question`,
    sectionId: 'support',
    kind: 'custom' as const,
    builtinKey: null,
    type: 'short_text' as const,
    label: { ca: `Pregunta ${id}` },
    help: null,
    privacy: 'normal' as const,
    defaultRequired: false,
    settings: {},
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-10-23T10:00:00Z',
    createdBy: null,
    createdByName: null,
    hasAnswers: null,
    options: [],
  });
  const placement = (id: string) => ({
    id: `${id}-placement`,
    fieldId: `${id}-question`,
    surface: 'onboarding' as const,
    screenKey: id,
    sortOrder: 0,
    required: false,
    labelOverride: null,
    helpOverride: null,
  });
  // The catalog lists screens by their anchor: C2 first.
  const catalog: IntakeCatalog = {
    ...EMPTY_INTAKE_CATALOG,
    screens: [screen('C2', 'identity'), screen('C1', 'logistics'), screen('C3', 'season')],
    flowOrder: ['custom:C1', 'custom:C2', 'custom:C3', 'identity'],
    layout: {
      sections: [],
      fields: ['C1', 'C2', 'C3'].map(field),
      placements: ['C2', 'C1', 'C3'].map(placement),
    },
  };
  const view = render(
    <InviteQuestionsReview
      answered={answered}
      states={{}}
      onChange={() => undefined}
      catalog={catalog}
    />,
  );
  const listed = [...view.container.querySelectorAll('[data-testid^="invite-screen-custom:"]')].map(
    (element) => element.getAttribute('data-testid'),
  );
  expect(listed).toEqual([
    'invite-screen-custom:C1',
    'invite-screen-custom:C2',
    'invite-screen-custom:C3',
  ]);
});
