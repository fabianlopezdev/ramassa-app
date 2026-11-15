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
import { systemAnswersFixture, systemFieldFixtureId, systemFieldsCatalogFixture } from '../testing';
import type { Database } from '../types/database';
import {
  addParticipantNote,
  fetchParticipantActivity,
  fetchParticipantRecord,
  setParticipantActive,
  updateParticipantRecord,
} from './participant-detail-actions';

type Client = SupabaseClient<Database>;

const PARTICIPANT_ID = '5eed0000-0000-4000-8000-000000000026';

const decryptedRow = {
  id: PARTICIPANT_ID,
  first_name: 'Rosa',
  last_name: 'Mamani',
  preferred_language: 'es',
  avatar_url: null,
  media_consent: false,
  terms_accepted_at: '2026-01-15T09:00:00Z',
  is_active: false,
  is_forum_banned: false,
  created_at: '2026-01-15T09:00:00Z',
  updated_at: '2026-01-15T09:00:00Z',
  // Her answers by field (RAPP-662), choices by their option key.
  answers: systemAnswersFixture({
    date_of_birth: '1996-03-27',
    place_of_birth: 'Oruro',
    nationality: 'Bolívia',
    document_type: 'nie',
    document_number: 'Y0000026Z',
    phone: '+34600000026',
    address: 'Carrer de Prova, 26',
    city: 'Vic',
    postal_code: '08500',
    has_dependents: 'no',
    clothing_size: 'L',
    shoe_size: '38',
  }),
};

interface RpcCall {
  readonly name: string;
  readonly args: unknown;
}

function rpcClient(result: { data: unknown; error: unknown }, calls: RpcCall[] = []): Client {
  return {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return name === 'intake_catalog'
        ? { data: systemFieldsCatalogFixture(), error: null }
        : result;
    },
  } as unknown as Client;
}

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

// Her record by field (RAPP-663) ---------------------------------------------------------------

test('fetchParticipantRecord reads her answers by field, with her organization fields', async () => {
  const calls: RpcCall[] = [];
  const record = await fetchParticipantRecord(
    rpcClient(
      {
        data: [
          {
            ...decryptedRow,
            anonymized_at: null,
            is_test_account: false,
            role: 'player',
          },
        ],
        error: null,
      },
      calls,
    ),
    PARTICIPANT_ID,
  );
  expect(calls.map((call) => call.name)).toEqual(['get_participant_profile', 'intake_catalog']);
  expect(calls[0]?.args).toEqual({ participant_id: PARTICIPANT_ID });
  expect(record?.answers[systemFieldFixtureId('phone')]).toBe('+34600000026');
  expect(record?.fields.get('phone')?.privacy).toBe('sensitive');
  expect(record?.role).toBe('player');
});

test('fetchParticipantRecord reads the fields once when the caller already has them', async () => {
  const calls: RpcCall[] = [];
  const fields = new Map();
  const record = await fetchParticipantRecord(
    rpcClient(
      {
        data: [
          {
            ...decryptedRow,
            anonymized_at: null,
            is_test_account: false,
            role: 'invited',
          },
        ],
        error: null,
      },
      calls,
    ),
    PARTICIPANT_ID,
    Promise.resolve(fields),
  );
  expect(calls.map((call) => call.name)).toEqual(['get_participant_profile']);
  expect(record?.fields).toBe(fields);
});

/**
 * Nobody by that id, or nobody this caller may read. Both are "there is no
 * participant here" as far as the screen is concerned, and both must be told
 * apart from a read that broke.
 */
test('fetchParticipantRecord reports a participant she may not read as absent', async () => {
  expect(
    await fetchParticipantRecord(rpcClient({ data: [], error: null }), PARTICIPANT_ID),
  ).toBeNull();
});

test('fetchParticipantRecord reports a FAILED read as a failure, never as an empty record', async () => {
  const failing = fetchParticipantRecord(
    rpcClient({ data: null, error: { message: 'connection reset' } }),
    PARTICIPANT_ID,
  );
  await expect(failing).rejects.toBeInstanceOf(AppError);
});

test('a record that does not parse is a typed failure that names fields, never values', async () => {
  const error = (await fetchParticipantRecord(
    rpcClient({ data: [{ ...decryptedRow, role: 7 }], error: null }),
    PARTICIPANT_ID,
  ).catch((thrown: unknown) => thrown)) as AppError;
  expect(error).toBeInstanceOf(AppError);
  expect(JSON.stringify(error.context)).not.toContain('Y0000026Z');
});

test('updateParticipantRecord sends her answers by field, an emptied one as null', async () => {
  const calls: RpcCall[] = [];
  await updateParticipantRecord(rpcClient({ data: null, error: null }, calls), PARTICIPANT_ID, {
    last_name: 'Mamani',
    answers: { [systemFieldFixtureId('city')]: 'Vic', [systemFieldFixtureId('phone')]: '' },
  });
  expect(calls).toEqual([
    {
      name: 'update_participant_profile',
      args: {
        participant_id: PARTICIPANT_ID,
        payload: {
          last_name: 'Mamani',
          answers: { [systemFieldFixtureId('city')]: 'Vic', [systemFieldFixtureId('phone')]: null },
        },
      },
    },
  ]);
});
