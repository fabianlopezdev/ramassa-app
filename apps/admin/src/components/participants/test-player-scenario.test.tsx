/**
 * Scenario switches on a test player (RAPP-619): each control sends one
 * change, sample answers come in her language, and a refusal is explained.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import {
  customAnswerError,
  parseIntakeCatalog,
  type CustomAnswerValue,
} from '@ramassa/shared/intake-builder';
import {
  scenarioCustomQuestions,
  type TestPlayerScenario,
  type TestPlayerScenarioChange,
} from '@ramassa/shared/participants';
import { TestPlayerScenarioPanel } from './test-player-scenario';

const scenario: TestPlayerScenario = {
  termsAccepted: false,
  currentSeason: '2026/27',
  signedThisSeason: false,
  returning: false,
  answered: new Set(['first_name', 'last_name']),
  customAnswered: new Set(['5eed0000-0000-4000-8045-0000000000b2']),
  orgId: '5eed0000-0000-4000-8000-000000000000',
  language: 'ar',
};

const OWNER = {
  orgId: '5eed0000-0000-4000-8000-000000000000',
  profileId: '5eed0000-0000-4000-8000-000000000096',
};
const question = (id: string, type: string, settings: unknown = {}) => ({
  id,
  question_type: type,
  label: { ca: `Pregunta ${type}` },
  help: null,
  privacy: 'personal',
  placements: ['wizard'],
  sort_order: 0,
  is_archived: false,
  settings,
  options: [],
});
const catalog = parseIntakeCatalog({
  screens: [
    {
      id: '5eed0000-0000-4000-8044-0000000000b1',
      title: { ca: 'Més' },
      intro: null,
      after_screen: 'logistics',
      sort_order: 0,
      is_archived: false,
      questions: [
        question('5eed0000-0000-4000-8045-0000000000b1', 'number', { integer: true, min: 3 }),
        question('5eed0000-0000-4000-8045-0000000000b2', 'signature'),
        question('5eed0000-0000-4000-8045-0000000000b3', 'file_upload', { accept: 'photo' }),
        question('5eed0000-0000-4000-8045-0000000000b4', 'consent', { text: { ca: 'Accepto' } }),
      ],
    },
  ],
  overrides: [],
  presets: [],
});
const customQuestions = scenarioCustomQuestions(catalog);

function renderPanel(onChange = mock(async (change: TestPlayerScenarioChange) => void change)) {
  const view = render(
    <TestPlayerScenarioPanel
      scenario={scenario}
      onChange={onChange}
      customQuestions={customQuestions}
      owner={OWNER}
    />,
  );
  return { view, onChange };
}

test('each switch sends one change', async () => {
  const { view, onChange } = renderPanel();
  fireEvent.click(view.getByText('testScenarioSeasonSetAction'));
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'season_signature', signed: true }),
  );
  fireEvent.click(view.getByText('testScenarioReturningSetAction'));
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'returning', returning: true }),
  );
  fireEvent.click(view.getByText('testScenarioReset'));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ kind: 'reset' }));
});

test('accepting the terms sends no version: the database accepts the current one (RAPP-613)', async () => {
  const { view, onChange } = renderPanel();
  fireEvent.click(view.getByText('testScenarioTermsSetAction'));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  expect(onChange.mock.calls[0]?.[0]).toEqual({ kind: 'terms', accepted: true });
});

test('a question is filled with the sample in her language, or cleared', async () => {
  const { view, onChange } = renderPanel();
  expect(view.getByTestId('test-scenario-answer-first_name').dataset.answered).toBe('true');
  const address = view.getByTestId('test-scenario-answer-address');
  fireEvent.click(address.querySelector('button') as HTMLButtonElement);
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'answers',
      fill: { address: 'شارع الاختبار 1' },
    }),
  );
  const firstName = view.getByTestId('test-scenario-answer-first_name');
  fireEvent.click(firstName.querySelector('button') as HTMLButtonElement);
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'answers', clear: ['first_name'] }),
  );
});

test('fill all answers her language too', async () => {
  const { view, onChange } = renderPanel();
  fireEvent.click(view.getByText('testScenarioFillAll'));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  const change = onChange.mock.calls[0]?.[0] as { fill: Record<string, unknown> };
  expect(change.fill.preferred_language).toBe('ar');
  expect(change.fill.shoe_size).toBe('38');
});

test('a refusal is explained', async () => {
  const { view } = renderPanel(
    mock(async () => {
      throw new Error('fill her required answers before she accepts the terms');
    }),
  );
  fireEvent.click(view.getByText('testScenarioTermsSetAction'));
  await waitFor(() =>
    expect(view.getByRole('alert').textContent).toBe('testScenarioNeedsRequiredAnswers'),
  );
});

test('staff questions of every type are filled with a valid sample, or cleared (RAPP-610)', async () => {
  const { view, onChange } = renderPanel();
  const signature = view.getByTestId('test-scenario-custom-5eed0000-0000-4000-8045-0000000000b2');
  expect(signature.dataset.answered).toBe('true');
  fireEvent.click(signature.querySelector('button') as HTMLButtonElement);
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'custom_answers',
      clear: ['5eed0000-0000-4000-8045-0000000000b2'],
    }),
  );
  fireEvent.click(view.getByText('testScenarioFillAllCustom'));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  const change = onChange.mock.calls[1]?.[0] as {
    kind: string;
    fill: Record<string, CustomAnswerValue>;
  };
  expect(change.kind).toBe('custom_answers');
  expect(Object.keys(change.fill)).toHaveLength(4);
  for (const asked of customQuestions)
    expect(customAnswerError(asked, change.fill[asked.id] ?? null)).toBeNull();
  expect(change.fill['5eed0000-0000-4000-8045-0000000000b1']).toBe(3);
});
