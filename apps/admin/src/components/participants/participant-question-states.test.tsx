/**
 * What her guided registration asks (RAPP-301): staff choose per question,
 * presets fill every choice, and Don't ask is not offered on a required
 * question nobody answered.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { IntakeQuestion } from '@ramassa/shared/intake';
import { ParticipantQuestionStates } from './participant-question-states';

const answered = new Set<IntakeQuestion>(['first_name', 'last_name', 'nationality']);

function select(view: ReturnType<typeof render>, question: string): HTMLSelectElement {
  const element = view.container.querySelector<HTMLSelectElement>(`#question-state-${question}`);
  if (element === null) throw new Error(`no ${question} choice`);
  return element;
}

function submit(view: ReturnType<typeof render>) {
  const form = view.getByTestId('participant-question-states').querySelector('form');
  if (form === null) throw new Error('no form');
  fireEvent.submit(form);
}

test('saves the states staff chose, Auto stored as nothing', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <ParticipantQuestionStates states={{ phone: 'skip' }} answered={answered} onSave={onSave} />,
  );
  expect(select(view, 'phone').value).toBe('skip');
  select(view, 'nationality').value = 'skip';
  select(view, 'clothing_size').value = 'ask';
  submit(view);
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({
      nationality: 'skip',
      clothing_size: 'ask',
      phone: 'skip',
    }),
  );
});

test('"She reviews everything" sets every question to Ask', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <ParticipantQuestionStates states={{}} answered={answered} onSave={onSave} />,
  );
  fireEvent.click(view.getByText(/questionStatesPresetReview|reviews everything/));
  await waitFor(() => expect(select(view, 'shoe_size').value).toBe('ask'));
  submit(view);
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const saved = (onSave.mock.calls[0] as unknown as [Record<string, string>])[0];
  expect(new Set(Object.values(saved))).toEqual(new Set(['ask']));
  expect(saved.avatar).toBeUndefined();
});

test("Don't ask is not offered on a required question nobody answered", () => {
  const view = render(
    <ParticipantQuestionStates
      states={{}}
      answered={answered}
      onSave={mock(async () => undefined)}
    />,
  );
  const skipShoe = select(view, 'shoe_size').querySelector<HTMLOptionElement>(
    'option[value="skip"]',
  );
  const skipNationality = select(view, 'nationality').querySelector<HTMLOptionElement>(
    'option[value="skip"]',
  );
  const skipPhone = select(view, 'phone').querySelector<HTMLOptionElement>('option[value="skip"]');
  expect(skipShoe?.disabled).toBe(true);
  expect(skipNationality?.disabled).toBe(false);
  expect(skipPhone?.disabled).toBe(false);
});
