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
import { systemFieldIndexFromCatalog } from '../intake-builder/field-answers';
import type { ProfileRecordWithFields } from '../schemas/profile';
import { systemFieldFixtureId, systemFieldsCatalogFixture } from '../testing/system-fields';
import { ownProfileQueryKey, useOwnProfile, useUpdateOwnProfile } from './use-own-profile';

// Her record by field (RAPP-663): her account, her answers by field id, her fields.
const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
const phoneId = systemFieldFixtureId('phone');
const savedRow: ProfileRecordWithFields = {
  id: '5eed0000-0000-4000-8000-000000000001',
  first_name: 'Amina',
  last_name: 'Al-Hassan',
  preferred_language: 'ar',
  avatar_url: null,
  media_consent: false,
  terms_accepted_at: '2026-07-31T10:00:00Z',
  answers: {
    [phoneId]: '+34600111222',
    [systemFieldFixtureId('city')]: 'Vic',
  },
  fields,
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
  onState: (state: {
    profile: ProfileRecordWithFields | null | undefined;
    isLoading: boolean;
  }) => void;
}) {
  const { data, isLoading } = useOwnProfile();
  onState({ profile: data, isLoading });
  return null;
}

test('useOwnProfile exposes the decrypted profile under a stable key', async () => {
  const client = makeClient();
  client.setQueryDefaults(ownProfileQueryKey, { queryFn: async () => savedRow });
  let latest: ProfileRecordWithFields | null | undefined;

  render(createElement(Probe, { onState: (state) => (latest = state.profile) }), {
    wrapper: wrapper(client),
  });

  await waitFor(() => expect(latest?.answers[phoneId]).toBe('+34600111222'));
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
    expect(client.getQueryData<ProfileRecordWithFields>(ownProfileQueryKey)?.answers[phoneId]).toBe(
      '+34600999888',
    );
  });

  failTheWrite?.();

  await waitFor(() => {
    expect(client.getQueryData<ProfileRecordWithFields>(ownProfileQueryKey)?.answers[phoneId]).toBe(
      '+34600111222',
    );
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
    const cached = client.getQueryData<ProfileRecordWithFields>(ownProfileQueryKey);
    expect(cached?.answers[phoneId]).toBe('+34600999888');
    // What the edit did not carry stays as stored.
    expect(cached?.answers[systemFieldFixtureId('city')]).toBe('Vic');
  });
});

test('a field asked with the generic renderer is painted as she gave it (RAPP-666)', async () => {
  const client = makeClient();
  client.setQueryData(ownProfileQueryKey, savedRow);
  client.setMutationDefaults(['own-profile', 'update'], { mutationFn: async () => undefined });
  const cityId = systemFieldFixtureId('city');

  let fire: ((edit: { phone: string }) => void) | undefined;
  render(createElement(EditProbe, { onReady: (mutate) => (fire = mutate) }), {
    wrapper: wrapper(client),
  });

  // Her municipality is off its control: the form never answers it, the generic renderer does.
  fire?.({
    phone: '+34600999888',
    generic: { fieldIds: [cityId], answers: { [cityId]: 'Manlleu' } },
  } as never);

  await waitFor(() => {
    const cached = client.getQueryData<ProfileRecordWithFields>(ownProfileQueryKey);
    expect(cached?.answers[phoneId]).toBe('+34600999888');
    expect(cached?.answers[cityId]).toBe('Manlleu');
  });
});
