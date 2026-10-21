/**
 * Deleting a test player (RAPP-617): a button, a confirmation, then the whole
 * act. Nothing happens before the confirmation, and a refusal is said.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { TestPlayerDelete } from './test-player-delete';

test('nothing is deleted until the confirmation, then the deletion runs once', async () => {
  const onDelete = mock<() => Promise<void>>(async () => undefined);
  const view = render(<TestPlayerDelete name="Joana Prova" onDelete={onDelete} />);
  fireEvent.click(view.getByRole('button', { name: /testPlayerDeleteAction/ }));
  expect(onDelete).not.toHaveBeenCalled();
  const dialog = await waitFor(() => view.getByRole('dialog'));
  expect(dialog.textContent).toContain('testPlayerDeleteBody');
  fireEvent.click(view.getByRole('button', { name: /testPlayerDeleteConfirm/ }));
  await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
});

test('cancelling deletes nothing', async () => {
  const onDelete = mock<() => Promise<void>>(async () => undefined);
  const view = render(<TestPlayerDelete name="Joana Prova" onDelete={onDelete} />);
  fireEvent.click(view.getByRole('button', { name: /testPlayerDeleteAction/ }));
  fireEvent.click(
    await waitFor(() => view.getByRole('button', { name: /testPlayerDeleteCancel/ })),
  );
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  expect(onDelete).not.toHaveBeenCalled();
});

test('a refusal stays on screen as a message', async () => {
  const view = render(
    <TestPlayerDelete
      name="Joana Prova"
      onDelete={async () => {
        throw new Error('refused');
      }}
    />,
  );
  fireEvent.click(view.getByRole('button', { name: /testPlayerDeleteAction/ }));
  fireEvent.click(
    await waitFor(() => view.getByRole('button', { name: /testPlayerDeleteConfirm/ })),
  );
  await waitFor(() =>
    expect(view.getByRole('alert').textContent).toContain('testPlayerDeleteFailed'),
  );
});
