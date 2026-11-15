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
  termsDraft: false,
  authorizationDraft: false,
};

const OWNER = {
  orgId: '5eed0000-0000-4000-8000-000000000000',
  profileId: '5eed0000-0000-4000-8000-000000000096',
};
const SCREEN = '5eed0000-0000-4000-8044-0000000000b1';
const SECTION = '5eed0000-0000-4000-8047-0000000000b1';
const fields: readonly (readonly [string, string, unknown])[] = [
  ['5eed0000-0000-4000-8045-0000000000b1', 'number', { integer: true, min: 3 }],
  ['5eed0000-0000-4000-8045-0000000000b2', 'file_upload', { accept: 'document' }],
  ['5eed0000-0000-4000-8045-0000000000b3', 'file_upload', { accept: 'photo' }],
  ['5eed0000-0000-4000-8045-0000000000b4', 'yes_no', {}],
];
const catalog = parseIntakeCatalog({
  screens: [
    {
      id: SCREEN,
      title: { ca: 'Més' },
      intro: null,
      after_screen: 'logistics',
      sort_order: 0,
      is_archived: false,
    },
  ],
  sections: [
    { id: SECTION, key: 'support', title: { ca: 'Suport' }, sort_order: 6, is_builtin: true },
  ],
  fields: fields.map(([id, type, settings], index) => ({
    id,
    section_id: SECTION,
    kind: 'custom',
    system_key: null,
    question_type: type,
    label: { ca: `Pregunta ${type}` },
    help: null,
    privacy: 'personal',
    default_required: false,
    settings,
    show_when_field_id: null,
    show_when_option_id: null,
    sort_order: index,
    is_archived: false,
    created_at: '2026-10-23T10:00:00Z',
    options: [],
  })),
  placements: fields.map(([id], index) => ({
    id: `5eed0000-0000-4000-8048-0000000000b${index + 1}`,
    field_id: id,
    surface: 'onboarding',
    screen_key: SCREEN,
    sort_order: index,
    required: false,
    label_override: null,
    help_override: null,
  })),
  overrides: [],
  presets: [],
});
const customQuestions = scenarioCustomQuestions(catalog);

function renderPanel(
  onChange = mock(async (change: TestPlayerScenarioChange) => void change),
  shown: TestPlayerScenario = scenario,
) {
  const view = render(
    <TestPlayerScenarioPanel
      scenario={shown}
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
      fill: ['address'],
      language: 'ar',
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
  const change = onChange.mock.calls[0]?.[0] as { fill: readonly string[]; language: string };
  expect(change.language).toBe('ar');
  expect(change.fill).toContain('preferred_language');
  expect(change.fill).toContain('shoe_size');
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
  const file = view.getByTestId('test-scenario-custom-5eed0000-0000-4000-8045-0000000000b2');
  expect(file.dataset.answered).toBe('true');
  fireEvent.click(file.querySelector('button') as HTMLButtonElement);
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

test('her page says when her phone shows a draft (RAPP-619)', () => {
  const none = renderPanel().view;
  expect(none.queryByTestId('test-scenario-draft-note')).toBeNull();
  none.unmount();
  const terms = renderPanel(undefined, { ...scenario, termsDraft: true });
  expect(terms.view.getByTestId('test-scenario-draft-terms')).toBeTruthy();
  expect(terms.view.queryByTestId('test-scenario-draft-authorization')).toBeNull();
  terms.view.unmount();
  const both = renderPanel(undefined, { ...scenario, termsDraft: true, authorizationDraft: true });
  expect(both.view.getByTestId('test-scenario-draft-authorization')).toBeTruthy();
});
