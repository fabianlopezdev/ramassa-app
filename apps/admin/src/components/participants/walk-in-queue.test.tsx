/**
 * The walk-in review queue (RAPP-305): confirm with her email, merge into a
 * player who is already in Ramassà, and matching names offered first.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { WalkInSigning } from '@ramassa/shared/authorization';
import { AppError } from '@ramassa/shared/errors';
import { mergeCandidates, WalkInQueue } from './walk-in-queue';

const walkIn: WalkInSigning = {
  id: '0b5e0000-0000-4000-8000-000000000002',
  firstName: 'Rim',
  lastName: 'Haddad',
  signedAt: '2026-10-16T17:00:00.000Z',
  collectedByName: 'Laia Puig',
  createdAt: '2026-10-16T17:10:00.000Z',
};
const players = [
  { profileId: 'p-1', name: 'Amina Benali' },
  { profileId: 'p-2', name: 'Rim Haddad' },
];

function forms(view: ReturnType<typeof render>) {
  return view.getByTestId(`walk-in-${walkIn.id}`).querySelectorAll('form');
}

test('confirming sends the email staff typed', async () => {
  const onConfirm = mock(async () => undefined);
  const view = render(
    <WalkInQueue
      walkIns={[walkIn]}
      players={players}
      onConfirm={onConfirm}
      onMerge={mock(async () => undefined)}
      onDiscard={mock(async () => undefined)}
    />,
  );
  const [confirmForm] = forms(view);
  const input = confirmForm!.querySelector<HTMLInputElement>('input[name="email"]')!;
  input.value = ' rim.haddad@example.test ';
  fireEvent.submit(confirmForm!);
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(walkIn.id, 'rim.haddad@example.test'));
});

test('merging sends the player staff chose', async () => {
  const onMerge = mock(async () => undefined);
  const view = render(
    <WalkInQueue
      walkIns={[walkIn]}
      players={players}
      onConfirm={mock(async () => undefined)}
      onMerge={onMerge}
      onDiscard={mock(async () => undefined)}
    />,
  );
  const mergeForm = forms(view)[1]!;
  mergeForm.querySelector<HTMLSelectElement>('select')!.value = 'p-2';
  fireEvent.submit(mergeForm);
  await waitFor(() => expect(onMerge).toHaveBeenCalledWith(walkIn.id, 'p-2'));
});

test('a refusal is shown on her row', async () => {
  const view = render(
    <WalkInQueue
      walkIns={[walkIn]}
      players={players}
      onConfirm={() => Promise.reject(new AppError('AUTH-3'))}
      onMerge={mock(async () => undefined)}
      onDiscard={mock(async () => undefined)}
    />,
  );
  const [confirmForm] = forms(view);
  confirmForm!.querySelector<HTMLInputElement>('input')!.value = 'rim@example.test';
  fireEvent.submit(confirmForm!);
  await waitFor(() => expect(view.getByText(/AUTH-3/)).toBeTruthy());
});

test('players whose name matches hers are offered first', () => {
  expect(mergeCandidates(walkIn, players).map(({ profileId }) => profileId)).toEqual([
    'p-2',
    'p-1',
  ]);
});

test('an empty queue says so', () => {
  const view = render(
    <WalkInQueue
      walkIns={[]}
      players={[]}
      onConfirm={mock(async () => undefined)}
      onMerge={mock(async () => undefined)}
      onDiscard={mock(async () => undefined)}
    />,
  );
  expect(view.getByText(/walkIns\.empty|No signatures/)).toBeTruthy();
});
