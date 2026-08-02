/**
 * The profile data actions (RAPP-22). These are the seam between the screens and
 * the two RPCs, so what is tested here is the seam's honesty: that a missing
 * profile is reported as absent rather than as a failure, that a failure is
 * never reported as an empty profile, and that the erasure request is filed
 * against the caller and nobody else.
 *
 * House style (as in `auth-actions`): these throw a typed AppError and the app
 * wraps them in its wired `safeAsync`, so nothing here reaches for a logger.
 * Absent and failed are therefore genuinely different return paths, not two
 * shades of the same empty object.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'bun:test';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import {
  fetchOwnDeletionRequest,
  fetchOwnProfile,
  requestOwnDeletion,
  updateOwnProfile,
} from './profile-actions';

type Client = SupabaseClient<Database>;

const decryptedRow = {
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

function rpcClient(
  result: { data: unknown; error: unknown },
  spy?: (args: unknown) => void,
): Client {
  return {
    rpc: async (name: string, args: unknown) => {
      spy?.({ name, args });
      return result;
    },
  } as unknown as Client;
}

test('fetchOwnProfile returns the decrypted row the RPC produced', async () => {
  const profile = await fetchOwnProfile(rpcClient({ data: [decryptedRow], error: null }));
  expect(profile?.document_number).toBe('X1234567L');
  expect(profile?.place_of_birth).toBe('حلب');
});

/**
 * A player who has not finished onboarding has no profile. That is an expected
 * state with its own screen, not an error: reporting it as a failure would put
 * an error banner in front of a woman whose only problem is that she has not
 * filled the form yet.
 */
test('fetchOwnProfile reports a missing profile as absent, not as a failure', async () => {
  expect(await fetchOwnProfile(rpcClient({ data: [], error: null }))).toBeNull();
});

/**
 * The mirror image, and the dangerous one: a failed read must NEVER look like an
 * empty profile, or the edit screen would happily offer to overwrite a real
 * profile with blanks.
 */
test('fetchOwnProfile reports a failure as a failure, never as an empty profile', async () => {
  expect(
    fetchOwnProfile(rpcClient({ data: null, error: { message: 'boom' } })),
  ).rejects.toBeInstanceOf(AppError);
});

test('updateOwnProfile hands the payload to the re-encrypting RPC untouched', async () => {
  let received: { name: string; args: unknown } | undefined;
  const client = rpcClient({ data: null, error: null }, (call) => {
    received = call as { name: string; args: unknown };
  });
  const payload = { first_name: 'Amina', last_name: 'Al-Hassan' } as never;

  await updateOwnProfile(client, payload);

  expect(received?.name).toBe('update_own_profile');
  expect(received?.args).toEqual({ payload });
});

test('updateOwnProfile surfaces a rejected edit as an error, not as a silent no-op', async () => {
  expect(
    updateOwnProfile(
      rpcClient({ data: null, error: { message: 'not_null_violation' } }),
      {} as never,
    ),
  ).rejects.toBeInstanceOf(AppError);
});

function tableClient(options: {
  insertSpy?: (row: unknown) => void;
  insertError?: unknown;
  selectResult?: { data: unknown; error: unknown };
}): Client {
  const builder = {
    insert: async (row: unknown) => {
      options.insertSpy?.(row);
      return { error: options.insertError ?? null };
    },
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => options.selectResult ?? { data: null, error: null },
  };
  return { from: () => builder } as unknown as Client;
}

/**
 * The row carries the caller's own id. RLS would reject anything else, but
 * sending someone else's id and letting the database say no is not a design:
 * the client should not be able to express the request in the first place.
 */
test('requestOwnDeletion files the request against the caller', async () => {
  let received: unknown;
  const client = tableClient({ insertSpy: (row) => (received = row) });

  await requestOwnDeletion(client, {
    profileId: '5eed0000-0000-4000-8000-000000000001',
    reason: 'Ja no vull participar',
  });

  expect(received).toEqual({
    profile_id: '5eed0000-0000-4000-8000-000000000001',
    reason: 'Ja no vull participar',
  });
});

test('requestOwnDeletion accepts an empty reason: giving one is not a condition of the right', async () => {
  let received: { reason?: unknown } | undefined;
  const client = tableClient({ insertSpy: (row) => (received = row as { reason?: unknown }) });

  await requestOwnDeletion(client, { profileId: '5eed0000-0000-4000-8000-000000000001' });

  expect(received?.reason).toBeNull();
});

test('fetchOwnDeletionRequest returns the pending request so the screen can say it arrived', async () => {
  const client = tableClient({
    selectResult: { data: { id: 'req-1', state: 'open', created_at: '2026-07-31' }, error: null },
  });
  const request = await fetchOwnDeletionRequest(client, '5eed0000-0000-4000-8000-000000000001');
  expect(request?.state).toBe('open');
});

test('fetchOwnDeletionRequest reports no request as null rather than inventing one', async () => {
  expect(
    await fetchOwnDeletionRequest(
      tableClient({ selectResult: { data: null, error: null } }),
      '5eed0000-0000-4000-8000-000000000001',
    ),
  ).toBeNull();
});

/**
 * A builder that behaves like PostgREST's: awaitable on its own, and awaitable
 * AFTER `.abortSignal()`. Two shapes, because the point of the test is that the
 * caller's signal actually reaches the request rather than being accepted and
 * dropped.
 */
function cancellableRpcClient(
  result: { data: unknown; error: unknown },
  seen: { signal?: AbortSignal },
): Client {
  return {
    rpc: () => ({
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      abortSignal(signal: AbortSignal) {
        seen.signal = signal;
        return Promise.resolve(result);
      },
    }),
  } as unknown as Client;
}

test('fetchOwnProfile hands the caller cancellation to the request', async () => {
  const controller = new AbortController();
  const seen: { signal?: AbortSignal } = {};

  await fetchOwnProfile(cancellableRpcClient({ data: [decryptedRow], error: null }, seen), {
    signal: controller.signal,
  });

  expect(seen.signal).toBe(controller.signal);
});

test('fetchOwnProfile without a signal never reaches for abortSignal', async () => {
  const seen: { signal?: AbortSignal } = {};

  const profile = await fetchOwnProfile(
    cancellableRpcClient({ data: [decryptedRow], error: null }, seen),
  );

  expect(seen.signal).toBeUndefined();
  expect(profile?.document_number).toBe('X1234567L');
});

/**
 * The cast this replaced (`data as ProfileRow[]`) let a renamed or dropped
 * column through as `undefined`, which the profile screen renders as "Sense
 * omplir" — the app calmly telling a woman it holds nothing about her, in the
 * one place whose entire job is showing her what it holds. Contract rule 6.
 */
test('a row that does not match the schema is a typed failure, not a blank profile', async () => {
  const renamedColumn = { ...decryptedRow, document_number: undefined, docNumber: 'X1234567L' };

  await expect(fetchOwnProfile(rpcClient({ data: [renamedColumn], error: null }))).rejects.toThrow(
    AppError,
  );
});

test('the parse failure carries the field names but never the values', async () => {
  const renamedColumn = { ...decryptedRow, document_number: undefined, docNumber: 'X1234567L' };

  const error = (await fetchOwnProfile(rpcClient({ data: [renamedColumn], error: null })).catch(
    (thrown: unknown) => thrown,
  )) as AppError;

  expect(error.code).toBe('DB-1');
  expect(error.context.invalidFields).toEqual(['document_number']);
  expect(JSON.stringify(error.context)).not.toContain('X1234567L');
});
