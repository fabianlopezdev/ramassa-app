/**
 * The account-creation and password-reset seam (RAPP-25), tested the way the
 * other shared actions are: RPC names and argument names asserted literally,
 * because no type checker crosses the SQL boundary at runtime.
 *
 * The result-shape tests matter more than usual here. The RPC's single row
 * carries a PASSWORD that exists nowhere else and is shown once; a layer that
 * quietly returned `undefined` for a missing row would render a credentials
 * panel with an empty password over an account that was really created, and
 * that woman can never log in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'bun:test';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import { createParticipantAccount, resetParticipantPassword } from './account-actions';

type Client = SupabaseClient<Database>;

const PARTICIPANT_ID = '5eed0000-0000-4000-8000-000000000030';

interface RpcCall {
  readonly name: string;
  readonly args: unknown;
}

function rpcClient(result: { data: unknown; error: unknown }, calls: RpcCall[] = []): Client {
  return {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return result;
    },
  } as unknown as Client;
}

const createdRow = {
  profile_id: PARTICIPANT_ID,
  email: 'amina.x7kq@ramassa.invalid',
  password: 'abcd-efgh-jkmn',
};

test('createParticipantAccount sends the payload under the name the RPC declares', async () => {
  const calls: RpcCall[] = [];
  const payload = { first_name: 'Amina', last_name: 'Diallo', reference_entity: null };
  await createParticipantAccount(rpcClient({ data: [createdRow], error: null }, calls), payload);

  expect(calls[0]?.name).toBe('create_participant_account');
  expect(calls[0]?.args).toEqual({ payload });
});

test('createParticipantAccount returns the one-time credentials the RPC minted', async () => {
  const created = await createParticipantAccount(rpcClient({ data: [createdRow], error: null }), {
    first_name: 'Amina',
    last_name: 'Diallo',
    reference_entity: null,
  });

  expect(created.email).toBe('amina.x7kq@ramassa.invalid');
  expect(created.password).toBe('abcd-efgh-jkmn');
  expect(created.profile_id).toBe(PARTICIPANT_ID);
});

/**
 * A creation that returned no row is a FAILURE, never an account with empty
 * credentials: the panel this feeds is the only place the password will ever
 * be visible.
 */
test('createParticipantAccount refuses an empty result instead of returning blanks', async () => {
  const failing = createParticipantAccount(rpcClient({ data: [], error: null }), {
    first_name: 'Amina',
    last_name: 'Diallo',
    reference_entity: null,
  });
  await expect(failing).rejects.toBeInstanceOf(AppError);
});

test('createParticipantAccount surfaces a refused call as a typed failure', async () => {
  const failing = createParticipantAccount(
    rpcClient({ data: null, error: { message: 'rate limit reached' } }),
    { first_name: 'Amina', last_name: 'Diallo', reference_entity: null },
  );
  await expect(failing).rejects.toBeInstanceOf(AppError);
});

test('resetParticipantPassword names the subject by the parameter the RPC declares', async () => {
  const calls: RpcCall[] = [];
  await resetParticipantPassword(
    rpcClient({ data: 'wxyz-abcd-efgh', error: null }, calls),
    PARTICIPANT_ID,
  );

  expect(calls[0]?.name).toBe('reset_participant_password');
  expect(calls[0]?.args).toEqual({ participant_id: PARTICIPANT_ID });
});

test('resetParticipantPassword returns the new one-time password', async () => {
  expect(
    await resetParticipantPassword(
      rpcClient({ data: 'wxyz-abcd-efgh', error: null }),
      PARTICIPANT_ID,
    ),
  ).toBe('wxyz-abcd-efgh');
});

/**
 * The refusal the RPC raises for a magic-link account arrives as a failure,
 * not as an empty password the screen would display in a copy box.
 */
test('resetParticipantPassword treats a refusal or an empty result as a failure', async () => {
  await expect(
    resetParticipantPassword(
      rpcClient({ data: null, error: { message: 'this account signs in with a magic link' } }),
      PARTICIPANT_ID,
    ),
  ).rejects.toBeInstanceOf(AppError);

  await expect(
    resetParticipantPassword(rpcClient({ data: '', error: null }), PARTICIPANT_ID),
  ).rejects.toBeInstanceOf(AppError);
});
