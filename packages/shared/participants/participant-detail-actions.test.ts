/**
 * The staff participant-detail actions (RAPP-24): the seam between the detail
 * screen and the RPCs, tested the way `profile-actions` is.
 *
 * What matters here is the same distinction that file draws, in a place where
 * getting it wrong is worse. ABSENT and FAILED are different: a participant the
 * caller may not read must never arrive looking like a participant whose fields
 * are all empty, because the edit form would then offer to overwrite a real
 * record with blanks. And the RPC ARGUMENT NAMES are asserted, because no type
 * checker crosses the SQL boundary at runtime: a renamed parameter reaches
 * Postgres as "function does not exist" or, worse, as a NULL subject.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'bun:test';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import {
  addParticipantNote,
  fetchParticipantActivity,
  fetchParticipantDetail,
  setParticipantActive,
  updateParticipantProfile,
} from './participant-detail-actions';

type Client = SupabaseClient<Database>;

const PARTICIPANT_ID = '5eed0000-0000-4000-8000-000000000026';

const decryptedRow = {
  id: PARTICIPANT_ID,
  first_name: 'Rosa',
  last_name: 'Mamani',
  date_of_birth: '1996-03-27',
  place_of_birth: 'Oruro',
  nationality: 'Bolívia',
  preferred_language: 'es',
  document_type: 'nie',
  document_number: 'Y0000026Z',
  phone: '+34600000026',
  address: 'Carrer de Prova, 26',
  city: 'Vic',
  postal_code: '08500',
  reference_entity: null,
  reference_contact_name: null,
  has_dependents: false,
  num_dependents: 0,
  clothing_size: 'L',
  shoe_size: '38',
  avatar_url: null,
  media_consent: false,
  terms_accepted_at: '2026-01-15T09:00:00Z',
  is_active: false,
  is_forum_banned: false,
  created_at: '2026-01-15T09:00:00Z',
  updated_at: '2026-01-15T09:00:00Z',
};

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

test('fetchParticipantDetail returns the decrypted row the RPC produced', async () => {
  const detail = await fetchParticipantDetail(
    rpcClient({ data: [decryptedRow], error: null }),
    PARTICIPANT_ID,
  );

  expect(detail?.document_number).toBe('Y0000026Z');
  expect(detail?.phone).toBe('+34600000026');
  // The staff-only fields the player-side row does not carry.
  expect(detail?.is_active).toBe(false);
});

test('fetchParticipantDetail names the subject by the parameter the RPC declares', async () => {
  const calls: RpcCall[] = [];
  await fetchParticipantDetail(
    rpcClient({ data: [decryptedRow], error: null }, calls),
    PARTICIPANT_ID,
  );

  expect(calls[0]?.name).toBe('get_participant_profile');
  expect(calls[0]?.args).toEqual({ participant_id: PARTICIPANT_ID });
});

/**
 * Nobody by that id, or nobody this caller may read. Both are "there is no
 * participant here" as far as the screen is concerned, and both must be told
 * apart from a read that broke.
 */
test('fetchParticipantDetail reports an unreadable participant as absent', async () => {
  expect(
    await fetchParticipantDetail(rpcClient({ data: [], error: null }), PARTICIPANT_ID),
  ).toBeNull();
});

test('fetchParticipantDetail reports a FAILED read as a failure, never as an empty profile', async () => {
  const failing = fetchParticipantDetail(
    rpcClient({ data: null, error: { message: 'connection reset' } }),
    PARTICIPANT_ID,
  );

  await expect(failing).rejects.toBeInstanceOf(AppError);
});

test('updateParticipantProfile sends the subject and the payload the RPC declares', async () => {
  const calls: RpcCall[] = [];
  await updateParticipantProfile(rpcClient({ data: null, error: null }, calls), PARTICIPANT_ID, {
    first_name: 'Rosa',
  } as never);

  expect(calls[0]?.name).toBe('update_participant_profile');
  expect(calls[0]?.args).toEqual({
    participant_id: PARTICIPANT_ID,
    payload: { first_name: 'Rosa' },
  });
});

test('setParticipantActive sends the state it is moving to', async () => {
  const calls: RpcCall[] = [];
  await setParticipantActive(rpcClient({ data: null, error: null }, calls), PARTICIPANT_ID, true);

  expect(calls[0]?.name).toBe('set_participant_active');
  expect(calls[0]?.args).toEqual({ participant_id: PARTICIPANT_ID, next_is_active: true });
});

test('fetchParticipantActivity returns the empty timeline as an empty list, not as absent', async () => {
  expect(
    await fetchParticipantActivity(rpcClient({ data: [], error: null }), PARTICIPANT_ID),
  ).toEqual([]);
});

test('addParticipantNote files the note against the subject AND its author', async () => {
  const inserted: unknown[] = [];
  const client = {
    from: () => ({
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: null };
      },
    }),
  } as unknown as Client;

  await addParticipantNote(client, {
    participantId: PARTICIPANT_ID,
    authorId: '5eed0000-0000-4000-8000-000000000002',
    body: 'Ha demanat canviar l horari.',
  });

  // The author is not derivable from the row later: `auth.uid()` is checked by
  // the policy but not defaulted by the column, so a note that forgot to carry
  // it would be rejected rather than silently unsigned.
  expect(inserted[0]).toEqual({
    profile_id: PARTICIPANT_ID,
    author_id: '5eed0000-0000-4000-8000-000000000002',
    body: 'Ha demanat canviar l horari.',
  });
});
