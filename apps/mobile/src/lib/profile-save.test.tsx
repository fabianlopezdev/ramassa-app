/**
 * The profile save's settle policy (RAPP-22).
 *
 * The case that matters is the FAILED save. The edit screen renders its own
 * `saveFailed` message and its shake, and both are worth exactly nothing if the
 * screen has already been popped off the stack by the time the failure lands:
 * the woman is returned to a profile showing her OLD phone number with no
 * explanation, which reads as "the app ignored me" and, worse, is
 * indistinguishable from a save that worked and simply had nothing to change.
 *
 * Driven through the REAL mutation (`useUpdateOwnProfile` on a real
 * QueryClient) rather than by calling the callbacks by hand, because the bug
 * this covers was a choice of React Query lifecycle hook (`onSettled` runs on
 * BOTH paths) and only the real lifecycle can tell those hooks apart.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { AppError, toAppError } from '@ramassa/shared/errors';
import { ownProfileQueryKey, useUpdateOwnProfile } from '@ramassa/shared/profile';
import type { ProfileRow } from '@ramassa/shared/schemas';
import { profileFormResetOptions, profileSaveCallbacks } from './profile-save';

const savedRow = {
  id: '5eed0000-0000-4000-8000-000000000001',
  first_name: 'Amina',
  last_name: 'Al-Hassan',
  date_of_birth: '1995-03-14',
  place_of_birth: 'حلب',
  nationality: 'Síria',
  preferred_language: 'ar',
  document_type: 'nie',
  document_number: 'X1234567L',
  phone: '+34600111222',
  address: 'Carrer Major 1',
  city: 'Vic',
  postal_code: '08500',
  reference_entity: 'Creu Roja Osona',
  reference_contact_name: null,
  has_dependents: false,
  num_dependents: 0,
  clothing_size: 'M',
  shoe_size: '38',
  avatar_url: null,
  media_consent: false,
  terms_accepted_at: '2026-07-31T10:00:00Z',
} satisfies ProfileRow;

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

interface SaveProbeProps {
  readonly onSaved: () => void;
  readonly onFailed: (error: unknown) => void;
  readonly onReady: (save: (edit: { phone: string }) => void) => void;
}

/**
 * The edit screen's save, minus the form and the React Native tree: the same
 * mutation, wired with the same callbacks the screen builds.
 */
function SaveProbe({ onSaved, onFailed, onReady }: SaveProbeProps) {
  const update = useUpdateOwnProfile();
  onReady((edit) => update.mutate(edit as never, profileSaveCallbacks({ onSaved, onFailed })));
  return null;
}

test('a save the server rejected keeps the woman on the edit screen', async () => {
  const client = makeClient();
  client.setQueryData(ownProfileQueryKey, savedRow);

  let failTheWrite: (() => void) | undefined;
  const held = new Promise<never>((_resolve, reject) => {
    failTheWrite = () => reject(new AppError('DB-1', { message: 'no connection' }));
  });
  client.setMutationDefaults(['own-profile', 'update'], { mutationFn: () => held });

  let leftTheScreenCount = 0;
  let stayedWithAFailureCount = 0;
  // A holder rather than a `let`: TypeScript narrows a `let` initialised to
  // null down to `null`, because the only assignment is inside a callback it
  // cannot prove runs — so `expect(reportedCode).toBe('DB-1')` stops compiling
  // against the very union the test exists to check. Same idiom as the
  // `seen` holder in `packages/shared/profile/profile-actions.test.ts`.
  const reported: { code?: string } = {};
  let fire: ((edit: { phone: string }) => void) | undefined;

  render(
    createElement(SaveProbe, {
      onSaved: () => (leftTheScreenCount += 1),
      onFailed: (error) => {
        stayedWithAFailureCount += 1;
        reported.code = toAppError(error).code;
      },
      onReady: (save) => (fire = save),
    }),
    { wrapper: wrapper(client) },
  );

  fire?.({ phone: '+34600999888' });
  failTheWrite?.();

  // Asserted as ONE pair, not two statements. The failure has to have been
  // handled before "never navigated" means anything (that claim passes on any
  // implementation while the write is still in flight), and reporting both
  // counters together is what makes a regression say which way it broke rather
  // than just that a number was wrong.
  await waitFor(() =>
    expect({ leftTheScreenCount, stayedWithAFailureCount }).toEqual({
      leftTheScreenCount: 0,
      stayedWithAFailureCount: 1,
    }),
  );
  // Typed all the way to the screen, so what she is shown is the translated
  // `DB-1` message and a code she can read out, not a generic apology.
  expect(reported.code).toBe('DB-1');
});

test('a save the server accepted confirms it and leaves', async () => {
  const client = makeClient();
  client.setQueryData(ownProfileQueryKey, savedRow);
  client.setMutationDefaults(['own-profile', 'update'], { mutationFn: async () => undefined });

  let leftTheScreenCount = 0;
  let stayedWithAFailureCount = 0;
  let fire: ((edit: { phone: string }) => void) | undefined;

  render(
    createElement(SaveProbe, {
      onSaved: () => (leftTheScreenCount += 1),
      onFailed: () => (stayedWithAFailureCount += 1),
      onReady: (save) => (fire = save),
    }),
    { wrapper: wrapper(client) },
  );

  fire?.({ phone: '+34600999888' });

  await waitFor(() => expect(leftTheScreenCount).toBe(1));
  expect(stayedWithAFailureCount).toBe(0);
});

/**
 * The other half of "a failed save keeps her here": keeping her EDITS.
 *
 * The edit screen feeds react-hook-form from the React Query cache, and the
 * optimistic save rewrites that cache twice — once with the new values, once
 * back to the stored ones when the write fails. Every one of those writes is a
 * form reset. Without `keepDirtyValues` the second one silently restores the
 * server's values, so she is kept on a screen whose message is about work the
 * app has already discarded, which is worse than having been sent back.
 *
 * Driven through a real `useForm` with the real option object, rather than
 * asserting the object's shape: the shape is not the behaviour, and the
 * behaviour is a library contract that a version bump can change under us.
 */
const storedRow = { phone: '+34600111222', city: 'Vic' };
const optimisticRow = { phone: '+34600999888', city: 'Vic' };

test('a rolled-back save leaves the edits she typed in the form', () => {
  const { result, rerender } = renderHook(
    ({ values }: { values: typeof storedRow }) =>
      useForm({ values, resetOptions: profileFormResetOptions }),
    { initialProps: { values: storedRow } },
  );

  // She types a new phone number, presses Save: the cache is painted
  // optimistically, then the write fails and the cache rolls back.
  act(() => result.current.setValue('phone', '+34600999888', { shouldDirty: true }));
  rerender({ values: optimisticRow });
  rerender({ values: storedRow });

  // Her edit, not the stored value. Untouched fields still follow the row.
  expect(result.current.getValues()).toEqual({ phone: '+34600999888', city: 'Vic' });
});
