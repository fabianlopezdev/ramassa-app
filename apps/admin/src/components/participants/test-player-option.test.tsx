/**
 * The "Test player" option of the invitation form (RAPP-615): optional for
 * whoever invites players, forced on and locked for whoever creates test
 * players only.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { TestPlayerOption } from './test-player-option';

test('optional: off by default, and a click turns it on', () => {
  const onChange = mock<(checked: boolean) => void>(() => undefined);
  const view = render(<TestPlayerOption mode="optional" checked={false} onChange={onChange} />);
  const box = view.getByRole('checkbox', { name: /testPlayerOption/ }) as HTMLInputElement;
  expect(box.checked).toBe(false);
  expect(box.disabled).toBe(false);
  fireEvent.click(box);
  expect(onChange).toHaveBeenCalledWith(true);
  expect(view.getByText(/testPlayerOptionHelp/)).toBeTruthy();
});

test('forced: on, locked, and it says why', () => {
  const view = render(<TestPlayerOption mode="forced" checked onChange={() => undefined} />);
  const box = view.getByRole('checkbox', { name: /testPlayerOption/ }) as HTMLInputElement;
  expect(box.checked).toBe(true);
  expect(box.disabled).toBe(true);
  expect(view.getByText(/testPlayerForcedHelp/)).toBeTruthy();
});
