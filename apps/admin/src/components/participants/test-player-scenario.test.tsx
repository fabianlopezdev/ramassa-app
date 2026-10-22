/**
 * Scenario switches on a test player (RAPP-619): each control sends one
 * change, sample answers come in her language, and a refusal is explained.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { TestPlayerScenario, TestPlayerScenarioChange } from '@ramassa/shared/participants';
import { TestPlayerScenarioPanel } from './test-player-scenario';

const scenario: TestPlayerScenario = {
  termsAccepted: false,
  currentSeason: '2026/27',
  signedThisSeason: false,
  returning: false,
  answered: new Set(['first_name', 'last_name']),
  language: 'ar',
};

function renderPanel(onChange = mock(async (change: TestPlayerScenarioChange) => void change)) {
  const view = render(<TestPlayerScenarioPanel scenario={scenario} onChange={onChange} />);
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

test('accepting the terms sends the current terms version', async () => {
  const { view, onChange } = renderPanel();
  fireEvent.click(view.getByText('testScenarioTermsSetAction'));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  const change = onChange.mock.calls[0]?.[0] as { kind: string; terms_version?: string };
  expect(change.kind).toBe('terms');
  expect(change.terms_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
