/**
 * The profile query and its optimistic edit (RAPP-22).
 *
 * The interesting case is the FAILED edit. On a phone on patchy mobile data
 * (the SPEC's audience, on low-end Android) a save will fail regularly, and the
 * behaviour that matters then is that the screen goes back to showing the truth.
 * A cache left holding the optimistic value after a failed write is the worst of
 * both worlds: the woman believes her new phone number is saved, and only finds
 * out it is not when the team cannot reach her.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { AppError } from '../errors';
import type { ProfileRow } from '../schemas/profile';
import { ownProfileQueryKey, useOwnProfile, useUpdateOwnProfile } from './use-own-profile';

const savedRow: ProfileRow = {
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
};

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

function Probe({
  onState,
}: {
  onState: (state: { profile: ProfileRow | null | undefined; isLoading: boolean }) => void;
}) {
  const { data, isLoading } = useOwnProfile();
  onState({ profile: data, isLoading });
  return null;
}

test('useOwnProfile exposes the decrypted profile under a stable key', async () => {
  const client = makeClient();
  client.setQueryDefaults(ownProfileQueryKey, { queryFn: async () => savedRow });
  let latest: ProfileRow | null | undefined;

  render(createElement(Probe, { onState: (state) => (latest = state.profile) }), {
    wrapper: wrapper(client),
  });

  await waitFor(() => expect(latest?.phone).toBe('+34600111222'));
});

function EditProbe({ onReady }: { onReady: (mutate: (edit: { phone: string }) => void) => void }) {
  const mutation = useUpdateOwnProfile();
  onReady((edit) => mutation.mutate(edit as never));
  return null;
}

/**
 * Written as a SEQUENCE, not as a single end-state assertion. A test that only
 * waits for the old value passes instantly, before the optimistic update has
 * even been applied, and therefore keeps passing when the rollback is deleted
 * outright: it was checked against that exact mutation and it did not fail.
 *
 * So the write is held open here: first prove the optimistic value is on screen,
 * then release the failure, then prove the cache went back.
 */
test('a failed edit rolls the cache back to what is actually stored', async () => {
  const client = makeClient();
  client.setQueryData(ownProfileQueryKey, savedRow);

  let failTheWrite: (() => void) | undefined;
  const held = new Promise<never>((_resolve, reject) => {
    failTheWrite = () => reject(new AppError('DB-1', { message: 'no connection' }));
  });
  client.setMutationDefaults(['own-profile', 'update'], { mutationFn: () => held });

  let fire: ((edit: { phone: string }) => void) | undefined;
  render(createElement(EditProbe, { onReady: (mutate) => (fire = mutate) }), {
    wrapper: wrapper(client),
  });

  fire?.({ phone: '+34600999888' });

  await waitFor(() => {
    expect(client.getQueryData<ProfileRow>(ownProfileQueryKey)?.phone).toBe('+34600999888');
  });

  failTheWrite?.();

  await waitFor(() => {
    expect(client.getQueryData<ProfileRow>(ownProfileQueryKey)?.phone).toBe('+34600111222');
  });
});

test('a successful edit leaves the new value in the cache', async () => {
  const client = makeClient();
  client.setQueryData(ownProfileQueryKey, savedRow);
  client.setMutationDefaults(['own-profile', 'update'], { mutationFn: async () => undefined });

  let fire: ((edit: { phone: string }) => void) | undefined;
  render(createElement(EditProbe, { onReady: (mutate) => (fire = mutate) }), {
    wrapper: wrapper(client),
  });

  fire?.({ phone: '+34600999888' });

  await waitFor(() => {
    const cached = client.getQueryData<ProfileRow>(ownProfileQueryKey);
    expect(cached?.phone).toBe('+34600999888');
  });
});
