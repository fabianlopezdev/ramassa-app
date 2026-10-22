/**
 * An admin marks a team account as a test account (RAPP-615), so it signs in
 * with the staging fixed code (RAPP-616).
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { TeamTestAccountToggle } from './team-test-account-toggle';

test('ticking it saves the flag for that person', async () => {
  const onChange = mock<(isTestAccount: boolean) => Promise<void>>(async () => undefined);
  const view = render(
    <TeamTestAccountToggle name="Pau Dissenya" isTestAccount={false} onChange={onChange} />,
  );
  const box = view.getByRole('checkbox') as HTMLInputElement;
  expect(box.checked).toBe(false);
  fireEvent.click(box);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
});

test('a refusal is said, and the box keeps what the database holds', async () => {
  const view = render(
    <TeamTestAccountToggle
      name="Pau Dissenya"
      isTestAccount
      onChange={async () => {
        throw new Error('refused');
      }}
    />,
  );
  const box = view.getByRole('checkbox') as HTMLInputElement;
  expect(box.checked).toBe(true);
  fireEvent.click(box);
  await waitFor(() => expect(view.getByRole('alert').textContent).toContain('testAccountFailed'));
  expect(box.checked).toBe(true);
});
